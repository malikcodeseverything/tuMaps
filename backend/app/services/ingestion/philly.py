"""Fetches crime incidents from the Philadelphia Open Data Carto API.

Verified schema (2026-05-24):
  Coordinate fields: point_x (longitude), point_y (latitude)
  UCR field:         ucr_general — a TEXT string of the 3-digit UCR code, e.g. "300"
  No `lat` or `lng` columns exist in this table.
"""
import logging
from datetime import date, datetime, timedelta
from typing import List

import httpx

logger = logging.getLogger(__name__)

_CARTO_URL = "https://phl.carto.com/api/v2/sql"

# Bounding box enclosing Temple campus + surrounding neighborhoods
# point_y = latitude, point_x = longitude (Philly schema convention)
_BOUNDS = {"min_lat": 39.95, "max_lat": 40.01, "min_lng": -75.20, "max_lng": -75.12}


def _parse_ucr_code(ucr_raw) -> int:
    """Convert Philly's 3-digit UCR string (e.g. '300') to our 1-8 internal code.

    Philly Part 1 codes: 100 Homicide, 200 Rape, 300 Robbery, 400 Assault,
    500 Burglary, 600 Theft, 700 Motor Vehicle Theft, 800 Arson.
    Anything outside 100–899 is treated as a lower-severity Part 2 crime.
    """
    try:
        code = int(ucr_raw)
        if 100 <= code <= 899:
            return code // 100   # 100→1, 200→2, …, 800→8
        return 99
    except (ValueError, TypeError):
        return 99


def _build_query(since_date: date) -> str:
    b = _BOUNDS
    return (
        # point_x = longitude, point_y = latitude (verified against live schema)
        f"SELECT objectid, dispatch_date_time, ucr_general, text_general_code, "
        f"point_x, point_y "
        f"FROM incidents_part1_part2 "
        f"WHERE point_y BETWEEN {b['min_lat']} AND {b['max_lat']} "
        f"AND point_x BETWEEN {b['min_lng']} AND {b['max_lng']} "
        f"AND dispatch_date_time >= '{since_date.isoformat()}' "
        f"AND point_x IS NOT NULL AND point_y IS NOT NULL "
        f"LIMIT 50000"
    )


async def fetch_philly_incidents(years_back: int = 3) -> List[dict]:
    """Returns normalised incident dicts ready for deduplication and DB insert."""
    since = date.today() - timedelta(days=365 * years_back)
    query = _build_query(since)

    logger.info("Philly Open Data: querying incidents since %s", since.isoformat())

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(_CARTO_URL, params={"q": query})
            resp.raise_for_status()
            rows = resp.json().get("rows", [])
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Philly Open Data API returned HTTP %d — verify field names against live schema. "
            "Response body: %s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        return []
    except Exception:
        logger.exception("Philly Open Data fetch failed unexpectedly")
        return []

    logger.info("Philly Open Data: %d raw rows received", len(rows))

    incidents: List[dict] = []
    rejected = 0

    for row in rows:
        try:
            # dispatch_date_time arrives as ISO-8601 with Z suffix, e.g. "2025-04-23T22:18:00Z"
            dt_str = row["dispatch_date_time"].replace("Z", "+00:00")
            dt = datetime.fromisoformat(dt_str)

            incidents.append({
                "source": "philly_opd",
                "external_id": str(row["objectid"]),
                "lat": float(row["point_y"]),   # point_y = latitude
                "lng": float(row["point_x"]),   # point_x = longitude
                "incident_date": dt.date(),
                "ucr_code": _parse_ucr_code(row.get("ucr_general")),
                "crime_type": row.get("text_general_code", ""),
                "description": "",
            })
        except Exception:
            rejected += 1
            logger.debug("Rejected row objectid=%s: %s", row.get("objectid"), row)

    logger.info(
        "Philly Open Data: %d parsed, %d rejected (malformed rows)",
        len(incidents), rejected,
    )
    return incidents
