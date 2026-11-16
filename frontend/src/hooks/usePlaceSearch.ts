"use client";
import { useEffect, useId, useMemo, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { geocode } from "@/services/api";
import { QUICK_PICKS, searchCampus } from "@/data/campusPlaces";
import type { Place } from "@/types";

export type SearchStatus = "idle" | "searching" | "done";

const MAPBOX_MIN_CHARS = 3;
const MAPBOX_DEBOUNCE_MS = 250;
const MAX_RESULTS = 7;

// Mapbox often returns the same building as a campus entry; drop those duplicates.
function isNear(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 0.0005 && Math.abs(a[1] - b[1]) < 0.0004; // ~40 m
}

/**
 * Campus matches appear instantly; Mapbox addresses follow after a short
 * debounce. A newer query aborts the older request, and a response is only
 * shown if it belongs to the current query, so results never go stale.
 */
export function usePlaceSearch(query: string): { results: Place[]; status: SearchStatus } {
  const trimmed = query.trim();
  const campus = useMemo(() => searchCampus(trimmed), [trimmed]);
  const [remote, setRemote] = useState<{ query: string; places: Place[] }>({ query: "", places: [] });

  useEffect(() => {
    if (trimmed.length < MAPBOX_MIN_CHARS) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      geocode(trimmed, ctrl.signal)
        .then((places) => setRemote({ query: trimmed, places }))
        .catch(() => undefined); // aborted: a newer query is on its way
    }, MAPBOX_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  const wantsRemote = trimmed.length >= MAPBOX_MIN_CHARS;
  const remoteReady = remote.query === trimmed;
  const addresses =
    wantsRemote && remoteReady
      ? remote.places.filter((p) => !campus.some((c) => isNear(c.center, p.center)))
      : [];

  return {
    results: [...campus, ...addresses].slice(0, MAX_RESULTS),
    status: !trimmed ? "idle" : wantsRemote && !remoteReady ? "searching" : "done",
  };
}

/**
 * Everything a search box needs: the query, results, open state, and
 * keyboard support (arrow keys, Enter, Escape) with ARIA combobox wiring.
 * An empty, focused box shows a few popular campus places.
 */
export function usePlaceCombobox(onPick: (place: Place) => void) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const search = usePlaceSearch(query);

  const isQuickPicks = query.trim() === "";
  const results = isQuickPicks ? QUICK_PICKS : search.results;
  const status: SearchStatus = isQuickPicks ? "idle" : search.status;

  // The highlighted row resets whenever the result list changes.
  const resultsKey = results.map((r) => r.id).join("|");
  const [nav, setNav] = useState({ key: "", index: -1 });
  const activeIndex = nav.key === resultsKey ? nav.index : -1;

  const pick = (place: Place) => {
    setOpen(false);
    setQuery("");
    onPick(place);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next =
        activeIndex === -1
          ? step === 1 ? 0 : results.length - 1
          : (activeIndex + step + results.length) % results.length;
      setNav({ key: resultsKey, index: next });
    } else if (e.key === "Enter") {
      const place = results[Math.max(activeIndex, 0)];
      if (open && place) {
        e.preventDefault();
        pick(place);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return {
    query,
    setQuery,
    open,
    setOpen,
    results,
    status,
    isQuickPicks,
    activeIndex,
    optionId,
    listId,
    pick,
    inputProps: {
      value: query,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setOpen(true);
      },
      onKeyDown,
      onFocus: () => setOpen(true),
      onBlur: () => setOpen(false),
      role: "combobox" as const,
      "aria-expanded": open,
      "aria-controls": listId,
      "aria-autocomplete": "list" as const,
      "aria-activedescendant": open && activeIndex >= 0 ? optionId(activeIndex) : undefined,
      autoComplete: "off",
      autoCorrect: "off",
      spellCheck: false,
      enterKeyHint: "search" as const,
    },
  };
}

export type PlaceCombobox = ReturnType<typeof usePlaceCombobox>;
