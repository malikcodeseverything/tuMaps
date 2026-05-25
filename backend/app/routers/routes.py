import logging

from fastapi import APIRouter, HTTPException

from ..schemas.route import RouteRequest, RoutesResponse
from ..services.routing import compute_routes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.post("", response_model=RoutesResponse)
async def calculate_routes(req: RouteRequest):
    logger.info(
        "POST /api/routes  origin=%s  destination=%s",
        req.origin, req.destination,
    )
    try:
        result = compute_routes(
            origin_lng=req.origin[0],
            origin_lat=req.origin[1],
            dest_lng=req.destination[0],
            dest_lat=req.destination[1],
        )
        logger.info(
            "Route response: safest=%s fastest=%s balanced=%s",
            "ok" if result.get("safest") else "none",
            "ok" if result.get("fastest") else "none",
            "ok" if result.get("balanced") else "none",
        )
        return result
    except RuntimeError as exc:
        logger.error("Route request failed (503): %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        logger.warning("Route request rejected (422): %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        # Log full traceback so the actual cause appears in server logs
        logger.exception(
            "Unhandled exception in route calculation — origin=%s destination=%s",
            req.origin, req.destination,
        )
        raise HTTPException(status_code=500, detail="Routing computation failed")
