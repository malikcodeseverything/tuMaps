"""Heatmap payload for /api/incidents: built from the incidents table on data
refresh, stored as an artifact, and served from memory.
"""
import asyncio
import json
import logging
from collections import defaultdict
from typing import Optional

from sqlalchemy import func, select

from ..database import async_session_factory
from ..models.incident import Incident
from .artifacts import load_artifact, save_artifact
from .risk import SEVERITY

logger = logging.getLogger(__name__)

_ARTIFACT = "heatmap"
_DEFAULT_WEIGHT = 0.2
_COORD_DP = 5  # ~1.1 m; Philly geocodes many incidents to the same block point

_body: Optional[bytes] = None
_meta: dict = {}
_lock = asyncio.Lock()


async def _build_payload() -> dict:
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(Incident.lat, Incident.lng, Incident.ucr_code)
        )).all()
        earliest, latest = (await session.execute(
            select(func.min(Incident.incident_date), func.max(Incident.incident_date))
        )).one()

    # Merge incidents that share a location into one point whose weight is the
    # sum of their severities. Mapbox heatmaps add weights per pixel, so this
    # renders identically to sending every point, with far fewer features.
    weights: dict = defaultdict(float)
    for lat, lng, ucr in rows:
        weights[(round(lng, _COORD_DP), round(lat, _COORD_DP))] += SEVERITY.get(ucr, _DEFAULT_WEIGHT)

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [x, y]},
                "properties": {"weight": round(w, 2)},
            }
            for (x, y), w in weights.items()
        ],
        # Foreign member (allowed by RFC 7946); map libraries ignore it.
        "meta": {
            "incident_count": len(rows),
            "data_from": earliest.isoformat() if earliest else None,
            "data_through": latest.isoformat() if latest else None,
        },
    }


def _install(payload: dict) -> None:
    global _body, _meta
    _meta = payload.get("meta", {})
    _body = json.dumps(payload, separators=(",", ":")).encode()


async def rebuild() -> None:
    """Rebuild from the incidents table and store it (after a data refresh)."""
    payload = await _build_payload()
    if payload["meta"]["incident_count"]:
        await save_artifact(_ARTIFACT, payload)
    _install(payload)
    logger.info("Heatmap rebuilt: %d points from %d incidents",
                len(payload["features"]), payload["meta"]["incident_count"])


async def load() -> None:
    """Load the stored heatmap, building it once if none exists yet."""
    async with _lock:
        if _body is not None:
            return
        stored = await load_artifact(_ARTIFACT)
        if stored is not None:
            _install(stored)
            logger.info("Loaded precomputed heatmap (%d points)", len(stored["features"]))
        else:
            await rebuild()


async def get_body() -> bytes:
    if _body is None:
        await load()
    return _body  # type: ignore[return-value]


def get_meta() -> dict:
    return dict(_meta)
