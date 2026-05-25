"""A* routing on the OSM walk graph with three weight strategies.

Coordinate convention throughout this module:
  - Public API: origin_lng, origin_lat  (longitude first, matching GeoJSON)
  - OSMnx nodes: G.nodes[n]["x"] = longitude, G.nodes[n]["y"] = latitude
  - ox.nearest_nodes: X = longitude, Y = latitude
"""
import math
import logging
from typing import List, Dict, Any, Optional, Tuple

import networkx as nx

from .graph import get_graph, nearest_node

logger = logging.getLogger(__name__)

_MODES = {
    "safest": "safest_weight",      # units: metres × risk factor
    "fastest": "fastest_weight",    # units: seconds
    "balanced": "balanced_weight",  # units: seconds × risk factor
}

# Assumed pedestrian speed for admissible heuristic in time-based modes.
# osmnx default walk speed is 4.5 km/h = 1.25 m/s.
_WALK_SPEED_MPS = 1.25


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _make_heuristic(G, dest: int, weight_attr: str):
    """Return an admissible A* heuristic for the given weight attribute.

    safest_weight is in metres → heuristic is straight-line metres.
    fastest/balanced are in seconds → heuristic is straight-line metres / walk speed.
    Both underestimate the true cost, so the heuristic is admissible.
    """
    dlat = G.nodes[dest]["y"]
    dlng = G.nodes[dest]["x"]

    if weight_attr == "safest_weight":
        def h(u, _v):
            return _haversine_m(G.nodes[u]["y"], G.nodes[u]["x"], dlat, dlng)
    else:
        # Convert metres to seconds for time-based weights
        def h(u, _v):
            return _haversine_m(G.nodes[u]["y"], G.nodes[u]["x"], dlat, dlng) / _WALK_SPEED_MPS

    return h


def _path_to_linestring(G, path: List[int]) -> Dict[str, Any]:
    coords: List[Tuple[float, float]] = []
    for u, v in zip(path[:-1], path[1:]):
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            # Defensive: should not happen for a valid astar path
            logger.warning("Missing edge (%d, %d) in path — inserting straight segment", u, v)
            if not coords:
                coords.append((G.nodes[u]["x"], G.nodes[u]["y"]))
            coords.append((G.nodes[v]["x"], G.nodes[v]["y"]))
            continue

        edge = list(edge_data.values())[0]
        if "geometry" in edge:
            gc = list(edge["geometry"].coords)
            ux = G.nodes[u]["x"]
            if gc and abs(gc[0][0] - ux) > 1e-7:
                gc = gc[::-1]
            if coords:
                gc = gc[1:]
            coords.extend(gc)
        else:
            if not coords:
                coords.append((G.nodes[u]["x"], G.nodes[u]["y"]))
            coords.append((G.nodes[v]["x"], G.nodes[v]["y"]))

    return {"type": "LineString", "coordinates": coords}


def _path_metrics(G, path: List[int]) -> Tuple[float, float, float]:
    dist = time = risk_w = 0.0
    for u, v in zip(path[:-1], path[1:]):
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            continue
        e = list(edge_data.values())[0]
        ln = e.get("length", 0.0)
        dist += ln
        time += e.get("travel_time", ln / _WALK_SPEED_MPS)
        risk_w += e.get("risk", 0.0) * ln
    avg_risk = risk_w / dist if dist > 0 else 0.0
    return dist, time, avg_risk


def _path_segments(G, path: List[int]) -> List[Dict[str, Any]]:
    segs = []
    for u, v in zip(path[:-1], path[1:]):
        edge_data = G.get_edge_data(u, v)
        if edge_data is None:
            continue
        e = list(edge_data.values())[0]
        risk = e.get("risk", 0.0)
        if "geometry" in e:
            gc = list(e["geometry"].coords)
            if gc and abs(gc[0][0] - G.nodes[u]["x"]) > 1e-7:
                gc = gc[::-1]
        else:
            gc = [
                (G.nodes[u]["x"], G.nodes[u]["y"]),
                (G.nodes[v]["x"], G.nodes[v]["y"]),
            ]
        segs.append({
            "geometry": {"type": "LineString", "coordinates": gc},
            "risk": round(risk, 4),
        })
    return segs


def _check_edge_weights(G) -> None:
    """Warn if routing weights are missing from graph edges (e.g. risk skipped)."""
    required = ("safest_weight", "fastest_weight", "balanced_weight")
    edges = list(G.edges(keys=True, data=True))
    if not edges:
        return
    _, _, _, sample = edges[0]
    missing = [w for w in required if w not in sample]
    if missing:
        logger.error(
            "Routing weight attributes missing from edges: %s. "
            "Risk computation may have been skipped — routes will fall back to default weight=1.",
            missing,
        )
    else:
        logger.debug("Edge weight check passed: all three weight attributes present on sample edge")


def compute_routes(
    origin_lng: float, origin_lat: float,
    dest_lng: float, dest_lat: float,
) -> Dict[str, Any]:
    """Compute safest / fastest / balanced routes between two points.

    Args:
        origin_lng, origin_lat: WGS-84 coordinates of the start point (longitude first).
        dest_lng, dest_lat:     WGS-84 coordinates of the end point (longitude first).

    Returns:
        Dict with keys "safest", "fastest", "balanced"; each value is a route dict or None.

    Raises:
        RuntimeError: graph not loaded, or nearest-node lookup failed.
        ValueError:   origin and destination resolve to the same graph node.
    """
    G = get_graph()
    if G is None:
        raise RuntimeError("Road graph not loaded yet — try again in a moment")

    logger.info(
        "Route request: origin=(lng=%.6f, lat=%.6f)  destination=(lng=%.6f, lat=%.6f)",
        origin_lng, origin_lat, dest_lng, dest_lat,
    )

    # Nearest-node lookup — wrap explicitly so callers get a meaningful error
    try:
        orig = nearest_node(origin_lng, origin_lat)
        dest = nearest_node(dest_lng, dest_lat)
    except Exception:
        logger.exception(
            "nearest_node lookup failed for origin=(%.6f, %.6f) dest=(%.6f, %.6f). "
            "Points may be outside the mapped area.",
            origin_lng, origin_lat, dest_lng, dest_lat,
        )
        raise RuntimeError(
            "Could not resolve graph nodes for the requested coordinates. "
            "Ensure both points are within the Temple campus area."
        )

    # Log resolved nodes and their distance from the requested points
    orig_node_lat = G.nodes[orig]["y"]
    orig_node_lng = G.nodes[orig]["x"]
    dest_node_lat = G.nodes[dest]["y"]
    dest_node_lng = G.nodes[dest]["x"]

    orig_snap_m = _haversine_m(origin_lat, origin_lng, orig_node_lat, orig_node_lng)
    dest_snap_m = _haversine_m(dest_lat, dest_lng, dest_node_lat, dest_node_lng)

    logger.info(
        "Snapped nodes: origin_node=%d (node at lng=%.6f, lat=%.6f, snap=%.1fm)  "
        "dest_node=%d (node at lng=%.6f, lat=%.6f, snap=%.1fm)",
        orig, orig_node_lng, orig_node_lat, orig_snap_m,
        dest, dest_node_lng, dest_node_lat, dest_snap_m,
    )

    if orig == dest:
        raise ValueError(
            f"Origin and destination both resolve to the same graph node ({orig}). "
            "Use points that are further apart."
        )

    _check_edge_weights(G)

    results: Dict[str, Optional[Dict]] = {}

    for mode, weight_attr in _MODES.items():
        heuristic = _make_heuristic(G, dest, weight_attr)
        logger.info("Mode=%s: starting A* (weight=%s)", mode, weight_attr)
        try:
            path = nx.astar_path(G, orig, dest, heuristic=heuristic, weight=weight_attr)
            dist, time, risk = _path_metrics(G, path)
            logger.info(
                "Mode=%s: path found — %d nodes, %.0f m, %.0f s, avg_risk=%.4f",
                mode, len(path), dist, time, risk,
            )
            results[mode] = {
                "geometry": _path_to_linestring(G, path),
                "distance_m": round(dist, 1),
                "duration_s": round(time, 1),
                "risk_score": round(risk, 4),
                "segments": _path_segments(G, path),
            }
        except nx.NodeNotFound as exc:
            logger.error(
                "Mode=%s: node not in graph — %s. orig=%d dest=%d",
                mode, exc, orig, dest,
            )
            results[mode] = None
        except nx.NetworkXNoPath:
            logger.warning(
                "Mode=%s: no path between node %d and node %d "
                "(graph may be disconnected at these points)",
                mode, orig, dest,
            )
            results[mode] = None
        except Exception:
            logger.exception("Mode=%s: unexpected error during A* (orig=%d, dest=%d)", mode, orig, dest)
            results[mode] = None

    successful = sum(1 for v in results.values() if v is not None)
    logger.info("Route computation complete: %d/%d modes succeeded", successful, len(_MODES))

    return results
