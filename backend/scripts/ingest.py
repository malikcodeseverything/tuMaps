"""One-shot data ingestion script.

Usage (from backend/ directory):
    python -m scripts.ingest

Run this once after deployment, then periodically (e.g. weekly) to refresh
incident data from Philly Open Data and Temple PD.
"""
import asyncio
import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import delete
from app.database import create_tables, async_session_factory
from app.models.incident import Incident
from app.services.ingestion.philly import fetch_philly_incidents
from app.services.ingestion.temple import fetch_temple_incidents
from app.services.ingestion.merger import merge_and_deduplicate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest")


async def run() -> None:
    await create_tables()

    logger.info("=== Stage 1: Fetch Philadelphia Open Data ===")
    philly = await fetch_philly_incidents()
    logger.info("Philly: %d records ready for merge", len(philly))

    logger.info("=== Stage 2: Fetch Temple PD log ===")
    temple = await fetch_temple_incidents()
    logger.info("Temple PD: %d records ready for merge", len(temple))

    logger.info("=== Stage 3: Merge and deduplicate ===")
    merged = merge_and_deduplicate(philly, temple)
    logger.info("Merged total: %d unique incidents", len(merged))

    logger.info("=== Stage 4: Write to database ===")
    inserted = 0
    async with async_session_factory() as session:
        await session.execute(delete(Incident))
        session.add_all([
            Incident(
                source=d["source"],
                external_id=d["external_id"],
                lat=d["lat"],
                lng=d["lng"],
                incident_date=d["incident_date"],
                ucr_code=d.get("ucr_code"),
                crime_type=d.get("crime_type", ""),
                description=d.get("description", ""),
            )
            for d in merged
        ])
        await session.commit()
        inserted = len(merged)

    logger.info("=== Done: %d incidents inserted ===", inserted)


if __name__ == "__main__":
    asyncio.run(run())
