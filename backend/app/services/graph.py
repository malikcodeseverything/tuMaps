"""Road network graph: built once, cached to disk, held in memory.

The production image builds the graph at Docker build time
(scripts/build_graph.py), so the API only has to unpickle it on startup.
osmnx is imported lazily and only when no cached graph exists (local dev),
which keeps it, and geopandas, out of the running server's memory and
startup time.
"""
import hashlib
import logging
import math
import pickle
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)

CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "graph.pkl"
CENTER = (39.9812, -75.1557)  # Temple University main campus (lat, lng)
RADIUS_M = 2200               # covers campus + immediate surrounding blocks

# Average pedestrian speed (4.5 km/h). Must match _WALK_SPEED_MPS in routing.py,
# which the A* heuristic uses; a faster edge speed would make it inadmissible.
WALK_SPEED_MPS = 1.25
_WALK_SPEED_KPH = WALK_SPEED_MPS * 3.6

# Local metric projection for nearest-node lookups (accurate to well under a
# metre across a few km).
_SCALE_LAT = 111_111.0
_SCALE_LNG = 111_111.0 * math.cos(math.radians(CENTER[0]))

# Edge attributes the app actually reads; everything else osmnx adds is dropped.
_EDGE_KEEP = {"length", "geometry"}

_graph = None
_graph_id = ""
_node_ids: np.ndarray = np.empty(0, dtype=np.int64)
_node_tree = None


def _apply_walk_speeds(g) -> None:
    """Set every edge to walking speed and derive travel_time from length.

    osmnx's add_edge_speeds() imputes driving speeds from maxspeed/highway tags,
    which made walk times several times too short. This runs on every load so a
    graph cached by older code is corrected too.
    """
    for _, _, data in g.edges(data=True):
        length = data.get("length", 0.0)
        data["speed_kph"] = _WALK_SPEED_KPH
        data["travel_time"] = length / WALK_SPEED_MPS


def _slim(g) -> None:
    """Drop OSM tags the app never reads, to shrink the pickle and memory."""
    for _, data in g.nodes(data=True):
        for key in [k for k in data if k not in ("x", "y")]:
            del data[key]
    for _, _, data in g.edges(data=True):
        for key in [k for k in data if k not in _EDGE_KEEP]:
            del data[key]


def download_graph():
    """Download the walk network from OpenStreetMap (needs osmnx and network)."""
    import osmnx as ox  # heavy import, only needed when building the graph

    logger.info("Downloading road graph from OpenStreetMap…")
    g = ox.graph_from_point(CENTER, dist=RADIUS_M, network_type="walk")
    _slim(g)
    _apply_walk_speeds(g)
    return g


def save_graph(g, path: Path = CACHE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "wb") as f:
        pickle.dump(g, f, protocol=pickle.HIGHEST_PROTOCOL)
    tmp.replace(path)  # atomic: never leaves a half-written cache


def _compute_graph_id(g) -> str:
    """Fingerprint of the edge set, used to validate stored per-edge risk."""
    h = hashlib.sha1()
    for u, v, k in g.edges(keys=True):
        h.update(f"{u},{v},{k};".encode())
    return h.hexdigest()[:16]


def _install(g) -> None:
    global _graph, _graph_id, _node_ids, _node_tree
    ids = np.fromiter(g.nodes, dtype=np.int64, count=len(g))
    coords = np.array([
        [(g.nodes[n]["y"] - CENTER[0]) * _SCALE_LAT, (g.nodes[n]["x"] - CENTER[1]) * _SCALE_LNG]
        for n in ids
    ])
    _node_ids, _node_tree = ids, cKDTree(coords)
    _graph_id = _compute_graph_id(g)
    _graph = g  # set last: other threads treat a non-None graph as ready


def load_or_download() -> None:
    if CACHE_PATH.exists():
        logger.info("Loading road graph from disk cache…")
        with open(CACHE_PATH, "rb") as f:
            g = pickle.load(f)
        _apply_walk_speeds(g)
        _install(g)
        logger.info("Graph loaded: %d nodes, %d edges", len(g.nodes), len(g.edges))
        return

    logger.warning("No cached graph at %s; downloading (slow first start)", CACHE_PATH)
    g = download_graph()
    save_graph(g)
    _install(g)
    logger.info("Graph downloaded and cached: %d nodes, %d edges", len(g.nodes), len(g.edges))


def get_graph():
    return _graph


def get_graph_id() -> str:
    return _graph_id


# Incremented whenever edge risk scores change, so cached API payloads that
# depend on them know to rebuild.
_risk_version = 0


def bump_risk_version() -> None:
    global _risk_version
    _risk_version += 1


def get_risk_version() -> int:
    return _risk_version


# Points a little past the graph's edge still snap to a nearby street; beyond
# this the nearest node would be a misleading stand-in for the real location.
SERVICE_RADIUS_M = RADIUS_M + 300


def within_service_area(lng: float, lat: float) -> bool:
    dy = (lat - CENTER[0]) * _SCALE_LAT
    dx = (lng - CENTER[1]) * _SCALE_LNG
    return math.hypot(dx, dy) <= SERVICE_RADIUS_M


def nearest_node(lng: float, lat: float) -> int:
    """Closest graph node to a WGS-84 point (KD-tree in a local metric projection)."""
    if _node_tree is None:
        raise RuntimeError("Road graph not loaded")
    _, idx = _node_tree.query([(lat - CENTER[0]) * _SCALE_LAT, (lng - CENTER[1]) * _SCALE_LNG])
    return int(_node_ids[idx])


# 5 decimal places is ~1.1 m at this latitude: invisible on the map, and it
# roughly halves the JSON size compared with full float precision.
_COORD_DP = 5


def graph_edges_as_geojson() -> dict:
    """Return all edges as a GeoJSON FeatureCollection for the risk layer.

    Only the properties the map uses are included (risk), with rounded
    coordinates, to keep the payload small.
    """
    G = _graph
    if G is None:
        return {"type": "FeatureCollection", "features": []}

    features = []
    seen = set()

    for u, v, key, data in G.edges(keys=True, data=True):
        pair = (min(u, v), max(u, v))
        if pair in seen:
            continue
        seen.add(pair)

        if "geometry" in data:
            raw = data["geometry"].coords
        else:
            raw = [
                (G.nodes[u]["x"], G.nodes[u]["y"]),
                (G.nodes[v]["x"], G.nodes[v]["y"]),
            ]
        coords = [[round(x, _COORD_DP), round(y, _COORD_DP)] for x, y in raw]

        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"risk": round(data.get("risk", 0.0), 3)},
        })

    return {"type": "FeatureCollection", "features": features}
