from fastapi import APIRouter, Response

from ..services.graph import graph_edges_as_geojson

router = APIRouter(prefix="/api/segments", tags=["segments"])


@router.get("/risk")
async def get_risk_segments(response: Response):
    response.headers["Cache-Control"] = "public, max-age=300"
    return graph_edges_as_geojson()
