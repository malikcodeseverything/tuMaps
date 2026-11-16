"""Deduplicates incident records from multiple sources.

Two incidents are considered duplicates when:
- They are from different sources
- Their locations are within SPATIAL_THRESHOLD_M metres of each other
- Their dates are within DATE_THRESHOLD_DAYS of each other

The Philly Open Data record is kept as the canonical record since it has
verified coordinates; the Temple PD record is discarded.

Candidates are only compared against kept records from *other* sources,
bucketed by date. With a single source this is O(n); the previous version
scanned every kept record for every candidate, which is O(n^2) and took
minutes for ~70k Philly rows even though no comparison could ever match.
"""
import math
import logging
from collections import defaultdict
from typing import Dict, List

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
    # source -> date ordinal -> kept incidents from that source on that day
    by_source_day: Dict[str, Dict[int, List[dict]]] = defaultdict(lambda: defaultdict(list))
    dropped = 0

    for candidate in all_incidents:
        day = candidate["incident_date"].toordinal()
        is_dup = False
        for source, days in by_source_day.items():
            if source == candidate["source"]:
                continue
            for d in range(day - DATE_THRESHOLD_DAYS, day + DATE_THRESHOLD_DAYS + 1):
                if any(_dist_m(candidate, e) <= SPATIAL_THRESHOLD_M for e in days.get(d, ())):
                    is_dup = True
                    break
            if is_dup:
                break

        if is_dup:
            dropped += 1
        else:
            kept.append(candidate)
            by_source_day[candidate["source"]][day].append(candidate)

    logger.info(
        "Merger: %d total -> %d kept, %d duplicates removed",
        len(all_incidents), len(kept), dropped,
    )
    return kept
