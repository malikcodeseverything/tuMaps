"""Road network graph — downloads from OSM once, caches to disk, held in memory."""
import pickle
import logging
from pathlib import Path

import osmnx as ox

logger = logging.getLogger(__name__)

_CACHE = Path(__file__).parent.parent.parent / "data" / "graph.pkl"
_CENTER = (39.9812, -75.1557)  # Temple University main campus (lat, lng)
_RADIUS_M = 2200               # covers campus + immediate surrounding blocks

# Average pedestrian speed (4.5 km/h). Must match _WALK_SPEED_MPS in routing.py,
# which the A* heuristic uses; a faster edge speed would make it inadmissible.
WALK_SPEED_MPS = 1.25
_WALK_SPEED_KPH = WALK_SPEED_MPS * 3.6

_graph = None


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


def load_or_download() -> None:
    global _graph
    if _CACHE.exists():
        logger.info("Loading road graph from disk cache…")
        with open(_CACHE, "rb") as f:
            g = pickle.load(f)
        _apply_walk_speeds(g)
        _graph = g
        logger.info("Graph loaded: %d nodes, %d edges", len(_graph.nodes), len(_graph.edges))
        return

    logger.info("Downloading road graph from OpenStreetMap (first run)…")
    g = ox.graph_from_point(_CENTER, dist=_RADIUS_M, network_type="walk")
    _apply_walk_speeds(g)

    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CACHE, "wb") as f:
        pickle.dump(g, f)

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
