"""Incident ingestion pipeline shared by scripts/ingest.py and the API's
background refresh.

fetch (Philly Open Data + Temple PD) -> merge/dedupe -> replace table.
"""
import logging
from datetime import date
from typing import Optional

from sqlalchemy import delete, func, insert, select

from ...database import async_session_factory
from ...models.artifact import Artifact
from ...models.incident import Incident
from .merger import merge_and_deduplicate
from .philly import fetch_philly_incidents
from .temple import fetch_temple_incidents

logger = logging.getLogger(__name__)

_INSERT_CHUNK = 5_000


async def latest_incident_date() -> Optional[date]:
    async with async_session_factory() as session:
        return (await session.execute(select(func.max(Incident.incident_date)))).scalar()


async def run_ingest(years_back: int = 3) -> int:
    """Fetch, merge and store incidents. Returns the number stored.

    If the primary source returns nothing (API down, schema change), the
    existing rows are left untouched instead of wiping the table.
    """
    philly = await fetch_philly_incidents(years_back=years_back)
    temple = await fetch_temple_incidents()
    logger.info("Ingest: %d Philly + %d Temple PD records fetched", len(philly), len(temple))

    if not philly:
        logger.warning("Ingest: Philly source returned no rows; keeping existing data")
        return 0

    # The fetchers already emit dicts keyed exactly like the Incident columns,
    # so they are inserted as-is (no second copy of ~70k rows in memory).
    rows = merge_and_deduplicate(philly, temple)
    del philly, temple

    # Single transaction: readers see either the old set or the new set.
    # Precomputed risk/heatmap describe the old set, so they go in the same
    # transaction; the next startup or the caller recomputes them.
    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(delete(Incident))
            for i in range(0, len(rows), _INSERT_CHUNK):
                await session.execute(insert(Incident), rows[i:i + _INSERT_CHUNK])
            await session.execute(delete(Artifact))

    logger.info("Ingest: stored %d incidents", len(rows))
    return len(rows)
