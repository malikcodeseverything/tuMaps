"""One-shot data ingestion script.

Usage (from backend/ directory):
    python -m scripts.ingest

The deployed API also refreshes incident data on its own (see
INCIDENT_REFRESH_HOURS in app/config.py), so this is mainly for local
development or forcing an immediate refresh.
"""
import asyncio
import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.database import create_tables, wait_for_db
from app.services.ingestion.pipeline import run_ingest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest")


async def run() -> None:
    await wait_for_db()
    await create_tables()
    stored = await run_ingest(years_back=settings.incident_years_back)
    logger.info("=== Done: %d incidents stored ===", stored)


if __name__ == "__main__":
    asyncio.run(run())
