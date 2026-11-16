from fastapi import APIRouter, Response

from ..services import heatmap

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

CACHE_CONTROL = "public, max-age=600"
# An empty heatmap means the database is still being filled; browsers must not
# keep it, or visitors see no heatmap for 10 minutes after the data arrives.
NO_STORE = "no-store"


@router.get("")
async def get_incidents():
    """Weighted heatmap points plus meta (incident count and date range).

    Served from memory; the payload is precomputed on each data refresh.
    """
    body = await heatmap.get_body()
    has_data = bool(heatmap.get_meta().get("incident_count"))
    return Response(
        body,
        media_type="application/json",
        headers={"Cache-Control": CACHE_CONTROL if has_data else NO_STORE},
    )
