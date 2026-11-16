import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def wait_for_db(attempts: int = 10, delay_s: float = 3.0) -> None:
    """Block until the database accepts connections.

    On a fresh deploy the API container can start before Postgres is ready,
    which used to crash startup with a connection timeout.
    """
    for attempt in range(1, attempts + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            if attempt > 1:
                logger.info("Database reachable after %d attempts", attempt)
            return
        except Exception as exc:
            if attempt == attempts:
                raise
            logger.warning(
                "Database not reachable (attempt %d/%d: %s); retrying in %.0fs",
                attempt, attempts, type(exc).__name__, delay_s,
            )
            await asyncio.sleep(delay_s)


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session():
    async with async_session_factory() as session:
        yield session
