from fastapi import APIRouter, Response

from ..services import heatmap

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

CACHE_CONTROL = "public, max-age=600"


@router.get("")
async def get_incidents():
    """Weighted heatmap points plus meta (incident count and date range).

    Served from memory; the payload is precomputed on each data refresh.
    """
    body = await heatmap.get_body()
    return Response(body, media_type="application/json", headers={"Cache-Control": CACHE_CONTROL})
