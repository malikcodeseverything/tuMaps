"""Deduplicates incident records from multiple sources.

Two incidents are considered duplicates when:
- They are from different sources
- Their locations are within SPATIAL_THRESHOLD_M metres of each other
- Their dates are within DATE_THRESHOLD_DAYS of each other

The Philly Open Data record is kept as the canonical record since it has
verified coordinates; the Temple PD record is discarded.
"""
import math
import logging
from datetime import date
from typing import List

logger = logging.getLogger(__name__)

SPATIAL_THRESHOLD_M = 80
DATE_THRESHOLD_DAYS = 2

_LAT_C = 39.9812
_SCALE_LAT = 111_111.0
_SCALE_LNG = 111_111.0 * math.cos(math.radians(_LAT_C))


def _dist_m(a: dict, b: dict) -> float:
    dlat = (a["lat"] - b["lat"]) * _SCALE_LAT
    dlng = (a["lng"] - b["lng"]) * _SCALE_LNG
    return math.sqrt(dlat ** 2 + dlng ** 2)


def merge_and_deduplicate(*source_lists: List[dict]) -> List[dict]:
    all_incidents = [i for src in source_lists for i in src]

    kept: List[dict] = []
    dropped = 0

    for candidate in all_incidents:
        is_dup = False
        for existing in kept:
            if existing["source"] == candidate["source"]:
                continue
            date_diff = abs((candidate["incident_date"] - existing["incident_date"]).days)
            if date_diff > DATE_THRESHOLD_DAYS:
                continue
            if _dist_m(candidate, existing) <= SPATIAL_THRESHOLD_M:
                is_dup = True
                break
        if not is_dup:
            kept.append(candidate)
        else:
            dropped += 1

    logger.info(
        "Merger: %d total → %d kept, %d duplicates removed",
        len(all_incidents), len(kept), dropped,
    )
    return kept
