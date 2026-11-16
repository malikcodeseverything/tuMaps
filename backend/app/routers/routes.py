import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..schemas.route import RouteRequest, RoutesResponse
from ..security import enforce_route_rate_limit, route_slot
from ..services.graph import within_service_area
from ..services.routing import compute_routes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/routes", tags=["routes"])

OUTSIDE_AREA_MESSAGE = "Both points must be within about 2 km of Temple's Main Campus."


@router.post("", response_model=RoutesResponse, dependencies=[Depends(enforce_route_rate_limit)])
async def calculate_routes(req: RouteRequest):
    # Coordinates are deliberately not logged: they show where people walk.
    if not (within_service_area(*req.origin) and within_service_area(*req.destination)):
        raise HTTPException(status_code=422, detail=OUTSIDE_AREA_MESSAGE)

    t0 = time.perf_counter()
    try:
        # A* is CPU work; run it off the event loop so /health and the map
        # layers stay responsive, and cap how many run at once.
        async with route_slot():
            result = await run_in_threadpool(
                compute_routes,
                origin_lng=req.origin[0],
                origin_lat=req.origin[1],
                dest_lng=req.destination[0],
                dest_lat=req.destination[1],
            )
    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.error("Route request failed (503): %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        logger.info("Route request rejected (422): %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Unhandled exception in route calculation")
        raise HTTPException(status_code=500, detail="Routing computation failed")

    logger.info(
        "Routes computed in %.0f ms: safest=%s fastest=%s balanced=%s",
        (time.perf_counter() - t0) * 1000,
        *("ok" if result.get(m) else "none" for m in ("safest", "fastest", "balanced")),
    )
    return result
