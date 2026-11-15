import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings, log_runtime_config
from .database import create_tables, async_session_factory
from .routers import routes, incidents, segments
from .services import graph as graph_service
from .services.risk import compute_and_apply

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_GRAPH_RETRY_INTERVAL_S = 60
_GRAPH_RETRY_MAX_ATTEMPTS = 10


async def _load_graph_and_risks() -> bool:
    """Load the road graph and apply risk weights.

    Returns True if the graph is loaded. Failures are logged instead of raised so
    the API can still start (and serve /health and /api/incidents) when the
    Overpass API is slow or unavailable.
    """
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, graph_service.load_or_download)
    except Exception:
        logger.exception("Road graph load failed")
        return False

    try:
        async with async_session_factory() as session:
            await compute_and_apply(session)
    except Exception:
        logger.exception("Risk computation failed; routes will use unweighted edges")

    return True


async def _retry_graph_load() -> None:
    for attempt in range(1, _GRAPH_RETRY_MAX_ATTEMPTS + 1):
        await asyncio.sleep(_GRAPH_RETRY_INTERVAL_S)
        logger.info("Retrying road graph load (attempt %d/%d)", attempt, _GRAPH_RETRY_MAX_ATTEMPTS)
        if await _load_graph_and_risks():
            logger.info("Road graph loaded on retry; routing is available")
            return
    logger.error("Giving up on road graph load after %d attempts", _GRAPH_RETRY_MAX_ATTEMPTS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_runtime_config()
    await create_tables()

    retry_task: Optional[asyncio.Task] = None
    if await _load_graph_and_risks():
        logger.info("Startup complete, ready to serve requests")
    else:
        logger.warning(
            "Starting in degraded mode: routing returns 503 until the road graph loads. "
            "Retrying every %ds in the background.",
            _GRAPH_RETRY_INTERVAL_S,
        )
        retry_task = asyncio.create_task(_retry_graph_load())

    yield

    if retry_task and not retry_task.done():
        retry_task.cancel()
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
    g = graph_service.get_graph()
    return {
        "status": "ok" if g is not None else "degraded",
        "graph_loaded": g is not None,
        "graph_nodes": len(g.nodes) if g else 0,
    }
