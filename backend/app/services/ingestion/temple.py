"""Fetches crime incidents from the Temple University Police Clery Act daily log.

Status (2026-05-24): https://police.temple.edu/crime-log returns ECONNREFUSED.
The host is unreachable.  This source is treated as optional — failures are
logged as warnings and the pipeline continues with Philly Open Data only.

If the URL becomes available again, no code changes are needed.
"""
import logging
from datetime import date, datetime
from typing import List

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_LOG_URL = "https://police.temple.edu/crime-log"

# Very rough geocode of common Temple campus locations — used when the log
# provides a building name rather than street coordinates.
_CAMPUS_GEOCODES: dict = {
    "default": (39.9812, -75.1557),  # centre of main campus
}

_UCR_KEYWORDS = {
    1: ["homicide", "murder"],
    2: ["rape", "sexual assault"],
    3: ["robbery"],
    4: ["assault", "aggravated"],
    5: ["burglary", "break"],
    6: ["theft", "larceny", "shoplifting"],
    7: ["vehicle", "auto theft", "carjacking"],
    8: ["arson"],
}


def _classify(description: str) -> int:
    desc = description.lower()
    for code, keywords in _UCR_KEYWORDS.items():
        if any(k in desc for k in keywords):
            return code
    return 99


async def fetch_temple_incidents() -> List[dict]:
    """Returns normalised incident dicts, or [] if the page is unavailable.

    This source is optional.  Any network or parse failure emits a warning
    and returns an empty list — the pipeline continues with Philly data only.
    """
    logger.info("Temple PD: attempting fetch from %s", _LOG_URL)

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(
                _LOG_URL,
                headers={"User-Agent": "TuMaps/1.0 (safety research)"},
            )
            resp.raise_for_status()
    except httpx.ConnectError:
        logger.warning(
            "Temple PD: connection refused at %s — host may be unreachable. "
            "Skipping this source (non-fatal, pipeline continues with Philly data).",
            _LOG_URL,
        )
        return []
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Temple PD: HTTP %d from %s — skipping (non-fatal).",
            exc.response.status_code,
            _LOG_URL,
        )
        return []
    except Exception as exc:
        logger.warning(
            "Temple PD: fetch failed (%s: %s) — skipping (non-fatal).",
            type(exc).__name__, exc,
        )
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    incidents: List[dict] = []
    rejected = 0

    for table in soup.find_all("table"):
        for row in table.find_all("tr")[1:]:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            try:
                raw_date = cells[0]
                description = cells[1] if len(cells) > 1 else ""
                location = cells[2] if len(cells) > 2 else ""

                dt: date | None = None
                for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%B %d, %Y"):
                    try:
                        dt = datetime.strptime(raw_date, fmt).date()
                        break
                    except ValueError:
                        continue
                if dt is None:
                    rejected += 1
                    continue

                lat, lng = _CAMPUS_GEOCODES.get(location.lower(), _CAMPUS_GEOCODES["default"])

                incidents.append({
                    "source": "temple_pd",
                    "external_id": f"{dt.isoformat()}_{len(incidents)}",
                    "lat": lat,
                    "lng": lng,
                    "incident_date": dt,
                    "ucr_code": _classify(description),
                    "crime_type": description[:100],
                    "description": description[:500],
                })
            except Exception as exc:
                rejected += 1
                logger.debug("Temple PD: skipped row — %s: %s", type(exc).__name__, exc)

    logger.info(
        "Temple PD: %d incidents parsed, %d rows rejected (unparseable date or missing fields)",
        len(incidents), rejected,
    )
    return incidents
