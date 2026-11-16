"""Fetches crime incidents from the Philadelphia Open Data Carto API.

Verified schema (2026-05-24):
  Coordinate fields: point_x (longitude), point_y (latitude)
  UCR field:         ucr_general, a TEXT string of the 3-digit UCR code, e.g. "300"
  No `lat` or `lng` columns exist in this table.

The query covers the same area as the routing graph (plus a margin for the
risk search radius) and pages through every matching row. An earlier version
used a larger box with an unordered LIMIT 50000, which silently kept an
arbitrary ~41% of the matching incidents.
"""
import asyncio
import logging
import math
from datetime import date, datetime, timedelta
from typing import List

import httpx

logger = logging.getLogger(__name__)

_CARTO_URL = "https://phl.carto.com/api/v2/sql"

# Keep in sync with services/graph.py (_CENTER, _RADIUS_M).
_CENTER_LAT, _CENTER_LNG = 39.9812, -75.1557
_RADIUS_M = 2200 + 100  # graph radius + margin so edges at the boundary see nearby incidents

_DLAT = _RADIUS_M / 111_111.0
_DLNG = _RADIUS_M / (111_111.0 * math.cos(math.radians(_CENTER_LAT)))
# point_y = latitude, point_x = longitude (Philly schema convention)
BOUNDS = {
    "min_lat": round(_CENTER_LAT - _DLAT, 4),
    "max_lat": round(_CENTER_LAT + _DLAT, 4),
    "min_lng": round(_CENTER_LNG - _DLNG, 4),
    "max_lng": round(_CENTER_LNG + _DLNG, 4),
}

PAGE_SIZE = 20_000
MAX_ROWS = 300_000  # safety cap; the graph area has ~70k incidents over 3 years
# Waits between attempts when Carto is busy (4 attempts per page in total).
RETRY_DELAYS_S = (5, 10, 20)


def _parse_ucr_code(ucr_raw) -> int:
    """Convert Philly's 3-digit UCR string (e.g. '300') to our 1-8 internal code.

    Philly Part 1 codes: 100 Homicide, 200 Rape, 300 Robbery, 400 Assault,
    500 Burglary, 600 Theft, 700 Motor Vehicle Theft, 800 Arson.
    Anything outside 100-899 is treated as a lower-severity Part 2 crime.
    """
    try:
        code = int(ucr_raw)
        if 100 <= code <= 899:
            return code // 100   # 100 -> 1, 200 -> 2, ..., 800 -> 8
        return 99
    except (ValueError, TypeError):
        return 99


def _build_query(since_date: date, after_objectid: int, limit: int) -> str:
    b = BOUNDS
    # Keyset pagination on objectid: stable and fast, unlike OFFSET.
    return (
        "SELECT objectid, dispatch_date_time, ucr_general, text_general_code, "
        "point_x, point_y "
        "FROM incidents_part1_part2 "
        f"WHERE point_y BETWEEN {b['min_lat']} AND {b['max_lat']} "
        f"AND point_x BETWEEN {b['min_lng']} AND {b['max_lng']} "
        f"AND dispatch_date_time >= '{since_date.isoformat()}' "
        "AND point_x IS NOT NULL AND point_y IS NOT NULL "
        f"AND objectid > {int(after_objectid)} "
        f"ORDER BY objectid LIMIT {int(limit)}"
    )


def _parse_row(row: dict) -> dict:
    # dispatch_date_time arrives as ISO-8601 with Z suffix, e.g. "2025-04-23T22:18:00Z"
    dt = datetime.fromisoformat(row["dispatch_date_time"].replace("Z", "+00:00"))
    return {
        "source": "philly_opd",
        "external_id": str(row["objectid"]),
        "lat": float(row["point_y"]),   # point_y = latitude
        "lng": float(row["point_x"]),   # point_x = longitude
        "incident_date": dt.date(),
        "ucr_code": _parse_ucr_code(row.get("ucr_general")),
        "crime_type": (row.get("text_general_code") or "")[:100],
        "description": "",
    }


def _is_transient(exc: Exception) -> bool:
    """Errors worth retrying: the server was busy or the network hiccupped.

    Carto answers HTTP 400 {"error":["query_wait_timeout"]} when its query queue
    is full, so a 400 counts as transient only when the body says timeout.
    """
    if isinstance(exc, httpx.TransportError):  # connect/read timeouts, resets
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 429 or status >= 500:
            return True
        return status == 400 and "timeout" in exc.response.text.lower()
    return False


async def _fetch_page(client: httpx.AsyncClient, query: str) -> list:
    """GET one page, retrying transient failures with backoff."""
    for attempt, wait_s in enumerate(RETRY_DELAYS_S + (None,), start=1):
        try:
            resp = await client.get(_CARTO_URL, params={"q": query})
            resp.raise_for_status()
            return resp.json().get("rows", [])
        except Exception as exc:
            if wait_s is None or not _is_transient(exc):
                raise
            logger.warning(
                "Philly Open Data: transient error on attempt %d (%s); retrying in %ds",
                attempt, _describe(exc), wait_s,
            )
            await asyncio.sleep(wait_s)
    raise AssertionError("unreachable")


def _describe(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code} {exc.response.text[:80]}"
    return type(exc).__name__


async def fetch_philly_incidents(years_back: int = 3) -> List[dict]:
    """Return normalised incident dicts ready for deduplication and DB insert.

    Returns [] on any API failure so callers can keep the existing data.
    """
    since = date.today() - timedelta(days=365 * years_back)
    logger.info(
        "Philly Open Data: querying incidents since %s within %s",
        since.isoformat(), BOUNDS,
    )

    incidents: List[dict] = []
    rejected = 0
    after = 0

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            while len(incidents) + rejected < MAX_ROWS:
                rows = await _fetch_page(client, _build_query(since, after, PAGE_SIZE))

                for row in rows:
                    try:
                        incidents.append(_parse_row(row))
                    except Exception:
                        rejected += 1
                        logger.debug("Rejected row objectid=%s: %s", row.get("objectid"), row)

                logger.info("Philly Open Data: page of %d rows (total %d)", len(rows), len(incidents))
                if len(rows) < PAGE_SIZE:
                    break
                after = rows[-1]["objectid"]
            else:
                logger.warning("Philly Open Data: hit MAX_ROWS=%d safety cap", MAX_ROWS)
    except httpx.HTTPStatusError as exc:
        hint = (
            "the server stayed busy after retries"
            if _is_transient(exc)
            else "verify field names against live schema"
        )
        logger.error(
            "Philly Open Data API returned HTTP %d (%s). Response body: %s",
            exc.response.status_code,
            hint,
            exc.response.text[:500],
        )
        return []
    except Exception:
        logger.exception("Philly Open Data fetch failed unexpectedly")
        return []

    logger.info(
        "Philly Open Data: %d parsed, %d rejected (malformed rows)",
        len(incidents), rejected,
    )
    return incidents
