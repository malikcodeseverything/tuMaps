import json
from typing import Optional, Tuple

from fastapi import APIRouter, Response

from ..services.graph import get_graph, get_risk_version, graph_edges_as_geojson
from ..services.risk import risk_scores_ready

router = APIRouter(prefix="/api/segments", tags=["segments"])

CACHE_CONTROL = "public, max-age=600"
# While scores are placeholders (graph loading, or database still being filled),
# browsers must not keep the response, or they show all-zero risk for 10 minutes.
NO_STORE = "no-store"

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
            return Response(body, media_type="application/json", headers={"Cache-Control": NO_STORE})
        _cache = (version, body)
    cache_control = CACHE_CONTROL if risk_scores_ready() else NO_STORE
    return Response(_cache[1], media_type="application/json", headers={"Cache-Control": cache_control})
