import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import date
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings, log_runtime_config
from .database import create_tables, wait_for_db
from .routers import routes, incidents, segments
from .services import graph as graph_service
from .services import heatmap
from .services.ingestion.pipeline import latest_incident_date, run_ingest
from .services.risk import load_or_compute_risk

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_GRAPH_RETRY_INTERVAL_S = 60
_GRAPH_RETRY_MAX_ATTEMPTS = 10
_REFRESH_FIRST_CHECK_DELAY_S = 30  # let startup finish before the first data check
_REFRESH_RETRY_S = 15 * 60          # after a failed refresh, try again this soon

_startup_seconds = 0.0


async def _load_graph_and_risks() -> bool:
    """Load the road graph and apply risk weights.

    Returns True if the graph is loaded. Failures are logged instead of raised so
    the API can still start (and serve /health and /api/incidents) when the
    graph cannot be loaded.
    """
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, graph_service.load_or_download)
    except Exception:
        logger.exception("Road graph load failed")
        return False

    try:
        await load_or_compute_risk()
    except Exception:
        logger.exception("Risk scoring failed; routes will use unweighted edges")

    return True


async def _retry_graph_load() -> None:
    for attempt in range(1, _GRAPH_RETRY_MAX_ATTEMPTS + 1):
        await asyncio.sleep(_GRAPH_RETRY_INTERVAL_S)
        logger.info("Retrying road graph load (attempt %d/%d)", attempt, _GRAPH_RETRY_MAX_ATTEMPTS)
        if await _load_graph_and_risks():
            logger.info("Road graph loaded on retry; routing is available")
            return
    logger.error("Giving up on road graph load after %d attempts", _GRAPH_RETRY_MAX_ATTEMPTS)


async def refresh_incidents_if_stale() -> str:
    """Re-ingest incidents when the newest stored one is too old.

    Returns "current" (nothing to do), "refreshed" (new data stored) or
    "failed" (data is stale but the download did not succeed). On success the
    risk scores and the heatmap are recomputed and stored, so later startups
    just load them. While the service sleeps nothing runs, so this happens on
    the first wake after the data goes stale.
    """
    latest = await latest_incident_date()
    age_days = (date.today() - latest).days if latest else None
    if age_days is not None and age_days <= settings.incident_max_age_days:
        logger.info("Incident data is current (newest incident %s)", latest)
        return "current"

    logger.info("Incident data is stale (newest incident %s); refreshing", latest)
    stored = await run_ingest(years_back=settings.incident_years_back)
    if not stored:
        return "failed"

    await load_or_compute_risk(force=True)  # no-op if the graph is not loaded yet
    await heatmap.rebuild()
    logger.info("Incident refresh complete: %d incidents, risk and heatmap updated", stored)
    return "refreshed"


async def _incident_refresh_loop(first_delay_s: float) -> None:
    await asyncio.sleep(first_delay_s)
    while True:
        try:
            status = await refresh_incidents_if_stale()
        except Exception:
            logger.exception("Incident refresh crashed")
            status = "failed"
        if status == "failed":
            # Don't leave stale (or, on a fresh database, empty) data in place
            # for a whole day because the source was briefly unavailable.
            logger.warning("Incident refresh failed; retrying in %d min", _REFRESH_RETRY_S // 60)
            await asyncio.sleep(_REFRESH_RETRY_S)
        else:
            await asyncio.sleep(settings.incident_refresh_hours * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _startup_seconds
    t0 = time.perf_counter()
    log_runtime_config()
    await wait_for_db()
    await create_tables()

    background: List[asyncio.Task] = []
    if await _load_graph_and_risks():
        degraded = False
    else:
        degraded = True
        background.append(asyncio.create_task(_retry_graph_load()))

    try:
        await heatmap.load()
    except Exception:
        logger.exception("Heatmap load failed; it will be built on first request")

    _startup_seconds = time.perf_counter() - t0
    if degraded:
        logger.warning(
            "Started in degraded mode in %.1fs: routing returns 503 until the road graph "
            "loads. Retrying every %ds in the background.",
            _startup_seconds, _GRAPH_RETRY_INTERVAL_S,
        )
    else:
        logger.info("Startup complete in %.1fs, ready to serve requests", _startup_seconds)

    if settings.incident_refresh_hours > 0:
        # An empty database (first deploy) is filled right away.
        first_delay = 0 if not heatmap.get_meta().get("incident_count") else _REFRESH_FIRST_CHECK_DELAY_S
        background.append(asyncio.create_task(_incident_refresh_loop(first_delay)))

    yield

    for task in background:
        if not task.done():
            task.cancel()
    logger.info("Shutting down")


app = FastAPI(title="TuMaps Safety API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    # The frontend sends no cookies or auth headers, so credentials stay off.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)
app.include_router(incidents.router)
app.include_router(segments.router)


@app.get("/health")
async def health():
    """Liveness plus a few facts the landing page shows. Never touches the DB."""
    g = graph_service.get_graph()
    meta = heatmap.get_meta()
    return {
        "status": "ok" if g is not None else "degraded",
        "graph_loaded": g is not None,
        "graph_nodes": len(g.nodes) if g else 0,
        "graph_edges": g.number_of_edges() if g else 0,
        "incident_count": meta.get("incident_count", 0),
        "data_through": meta.get("data_through"),
        "startup_seconds": round(_startup_seconds, 1),
    }
