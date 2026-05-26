"""Road network graph — downloads from OSM once, caches to disk, held in memory."""
import pickle
import logging
from pathlib import Path

import osmnx as ox

logger = logging.getLogger(__name__)

_CACHE = Path(__file__).parent.parent.parent / "data" / "graph.pkl"
_CENTER = (39.9812, -75.1557)  # Temple University main campus (lat, lng)
_RADIUS_M = 2200               # covers campus + immediate surrounding blocks
_WALK_SPEED_MPS = 1.25

_graph = None


def _normalize_walk_travel_times(g) -> bool:
    """Ensure cached/downloaded walk graphs use pedestrian travel times."""
    corrected = False
    sample_ratio = None

    for _u, _v, _k, data in g.edges(keys=True, data=True):
        length = data.get("length")
        if not length:
            continue
        expected = length / _WALK_SPEED_MPS
        existing = data.get("travel_time")
        if sample_ratio is None and existing:
            sample_ratio = existing / expected
        if existing is None or abs(existing - expected) > 0.01:
            data["travel_time"] = expected
            corrected = True

    if sample_ratio is not None and (sample_ratio < 0.5 or sample_ratio > 2.0):
        logger.warning(
            "Graph travel_time values looked non-walking-like; normalized all edges to %.2f m/s",
            _WALK_SPEED_MPS,
        )
    elif corrected:
        logger.info("Normalized graph travel_time values to %.2f m/s walking speed", _WALK_SPEED_MPS)

    return corrected


def _write_cache(g) -> None:
    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CACHE, "wb") as f:
        pickle.dump(g, f)


def load_or_download() -> None:
    global _graph
    if _CACHE.exists():
        logger.info("Loading road graph from disk cache…")
        with open(_CACHE, "rb") as f:
            _graph = pickle.load(f)
        if _normalize_walk_travel_times(_graph):
            _write_cache(_graph)
        logger.info("Graph loaded: %d nodes, %d edges", len(_graph.nodes), len(_graph.edges))
        return

    logger.info("Downloading road graph from OpenStreetMap (first run)…")
    g = ox.graph_from_point(_CENTER, dist=_RADIUS_M, network_type="walk")
    g = ox.add_edge_speeds(g)
    g = ox.add_edge_travel_times(g)
    _normalize_walk_travel_times(g)

    _write_cache(g)

    _graph = g
    logger.info("Graph downloaded and cached: %d nodes, %d edges", len(_graph.nodes), len(_graph.edges))


def get_graph():
    return _graph


def nearest_node(lng: float, lat: float) -> int:
    # osmnx convention: X = longitude, Y = latitude
    return ox.nearest_nodes(_graph, X=lng, Y=lat)


def graph_edges_as_geojson() -> dict:
    """Return all edges as a GeoJSON FeatureCollection for the risk layer."""
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

        risk = data.get("risk", 0.0)
        name = data.get("name", "")
        if isinstance(name, list):
            name = name[0]

        if "geometry" in data:
            coords = list(data["geometry"].coords)
        else:
            coords = [
                (G.nodes[u]["x"], G.nodes[u]["y"]),
                (G.nodes[v]["x"], G.nodes[v]["y"]),
            ]

        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"risk": round(risk, 4), "name": name or ""},
        })

    return {"type": "FeatureCollection", "features": features}
