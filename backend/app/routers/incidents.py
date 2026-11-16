import asyncio
import json
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Response
from sqlalchemy import func, select

from ..database import async_session_factory
from ..models.incident import Incident
from ..services.risk import SEVERITY

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

CACHE_CONTROL = "public, max-age=600"
_DEFAULT_WEIGHT = 0.2
_COORD_DP = 5  # ~1.1 m; Philly geocodes many incidents to the same block point

_cache: Optional[bytes] = None
_lock = asyncio.Lock()


def invalidate_cache() -> None:
    """Drop the cached payload; the next request rebuilds it from the DB."""
    global _cache
    _cache = None


async def _build_payload() -> bytes:
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

    payload = {
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
    return json.dumps(payload, separators=(",", ":")).encode()


@router.get("")
async def get_incidents():
    global _cache
    if _cache is None:
        async with _lock:
            if _cache is None:
                _cache = await _build_payload()
    return Response(_cache, media_type="application/json", headers={"Cache-Control": CACHE_CONTROL})
