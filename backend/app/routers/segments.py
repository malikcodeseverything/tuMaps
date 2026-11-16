import json
from typing import Optional, Tuple

from fastapi import APIRouter, Response

from ..services.graph import get_graph, get_risk_version, graph_edges_as_geojson

router = APIRouter(prefix="/api/segments", tags=["segments"])

CACHE_CONTROL = "public, max-age=600"

# (risk_version, payload). Rebuilt only when edge risks change.
_cache: Optional[Tuple[int, bytes]] = None


@router.get("/risk")
async def get_risk_segments():
    global _cache
    version = get_risk_version()
    if _cache is None or _cache[0] != version:
        body = json.dumps(graph_edges_as_geojson(), separators=(",", ":")).encode()
        if get_graph() is None:
            # Graph still loading: serve the empty collection without caching it.
            return Response(body, media_type="application/json", headers={"Cache-Control": "no-store"})
        _cache = (version, body)
    return Response(_cache[1], media_type="application/json", headers={"Cache-Control": CACHE_CONTROL})
