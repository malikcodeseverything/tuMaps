import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import create_tables, async_session_factory
from .routers import routes, incidents, segments
from .services import graph as graph_service
from .services.risk import compute_and_apply

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, graph_service.load_or_download)

    async with async_session_factory() as session:
        await compute_and_apply(session)

    logger.info("Startup complete — ready to serve requests")
    yield
    logger.info("Shutting down")


app = FastAPI(title="TuMaps Safety API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
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
        "status": "ok",
        "graph_loaded": g is not None,
        "graph_nodes": len(g.nodes) if g else 0,
    }
