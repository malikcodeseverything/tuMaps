"""Computes per-edge risk scores from incident data using a KD-tree spatial index."""
import math
import logging
from datetime import date

import numpy as np
from scipy.spatial import KDTree
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.incident import Incident
from .graph import get_graph, bump_risk_version

logger = logging.getLogger(__name__)

_LAT_C = 39.9812
_LNG_C = -75.1557
_SCALE_LAT = 111_111.0
_SCALE_LNG = 111_111.0 * math.cos(math.radians(_LAT_C))
_SEARCH_RADIUS_M = 75.0
_RECENCY_LAMBDA = 0.00385  # half-life ≈ 180 days

SEVERITY = {
    1: 1.0,   # Homicide
    2: 1.0,   # Rape
    3: 0.9,   # Robbery
    4: 0.8,   # Aggravated Assault
    5: 0.5,   # Burglary
    6: 0.35,  # Theft
    7: 0.4,   # Auto Theft
    8: 0.3,   # Arson
}
_DEFAULT_SEVERITY = 0.2


def _recency(d: date) -> float:
    days = max((date.today() - d).days, 0)
    return math.exp(-_RECENCY_LAMBDA * days)


async def compute_and_apply(session: AsyncSession) -> None:
    G = get_graph()
    if G is None:
        logger.warning("Graph not loaded — skipping risk computation")
        return

    # Only the four columns we need: loading full ORM objects for ~70k rows
    # costs far more memory than this tuple list.
    result = await session.execute(
        select(Incident.lat, Incident.lng, Incident.ucr_code, Incident.incident_date)
    )
    incidents = result.all()

    if not incidents:
        logger.info("No incidents in DB, all edge risks set to 0")
        for u, v, k in G.edges(keys=True):
            G[u][v][k]["risk"] = 0.0
        _apply_weights(G)
        bump_risk_version()
        return

    logger.info("Computing risk scores from %d incidents…", len(incidents))

    coords = np.array([
        [(lat - _LAT_C) * _SCALE_LAT, (lng - _LNG_C) * _SCALE_LNG]
        for lat, lng, _, _ in incidents
    ])
    # Severity x recency is a property of the incident alone, so compute it once.
    weights = np.array([
        SEVERITY.get(ucr, _DEFAULT_SEVERITY) * _recency(d)
        for _, _, ucr, d in incidents
    ])
    del incidents
    tree = KDTree(coords)

    raw: dict = {}
    for u, v, k in G.edges(keys=True):
        edge = G[u][v][k]
        if "geometry" in edge:
            mid = edge["geometry"].interpolate(0.5, normalized=True)
            mid_lat, mid_lng = mid.y, mid.x
        else:
            mid_lat = (G.nodes[u]["y"] + G.nodes[v]["y"]) / 2
            mid_lng = (G.nodes[u]["x"] + G.nodes[v]["x"]) / 2

        pt = [(mid_lat - _LAT_C) * _SCALE_LAT, (mid_lng - _LNG_C) * _SCALE_LNG]
        idxs = tree.query_ball_point(pt, r=_SEARCH_RADIUS_M)
        raw[(u, v, k)] = float(weights[idxs].sum()) if idxs else 0.0

    max_r = max(raw.values()) if raw else 1.0
    for (u, v, k), r in raw.items():
        G[u][v][k]["risk"] = r / max_r if max_r > 0 else 0.0

    _apply_weights(G)
    bump_risk_version()
    logger.info("Risk computation complete")


def _apply_weights(G) -> None:
    for u, v, k in G.edges(keys=True):
        e = G[u][v][k]
        risk = e.get("risk", 0.0)
        length = e.get("length", 10.0)
        tt = e.get("travel_time", length / 1.4)

        G[u][v][k]["safest_weight"] = length * (1.0 + 15.0 * risk)
        G[u][v][k]["fastest_weight"] = tt
        G[u][v][k]["balanced_weight"] = tt * (1.0 + 5.0 * risk)
