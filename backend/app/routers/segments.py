from fastapi import APIRouter

from ..services.graph import graph_edges_as_geojson

router = APIRouter(prefix="/api/segments", tags=["segments"])


@router.get("/risk")
async def get_risk_segments():
    return graph_edges_as_geojson()
