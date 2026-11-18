// Remembers the trip in this browser tab so a refresh mid-walk resumes it.
// sessionStorage keeps it to this tab, and old trips expire.
import type { RouteMode } from "@/types";

const KEY = "tumaps.trip.v1";
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const MODES: RouteMode[] = ["safest", "fastest", "balanced"];

export interface SavedTrip {
  origin: [number, number];
  destination: [number, number];
  originName: string | null;
  destinationName: string | null;
  mode: RouteMode;
  navigating: boolean;
}

function isPoint(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) && v.length === 2 &&
    typeof v[0] === "number" && typeof v[1] === "number" &&
    Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90
  );
}

function cleanName(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, 120) : null;
}

export function loadTrip(): SavedTrip | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    // Parse into plain values and validate every field; never spread the object.
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (typeof d.savedAt !== "number" || Date.now() - d.savedAt > MAX_AGE_MS) return null;
    if (!isPoint(d.origin) || !isPoint(d.destination)) return null;
    const mode = MODES.includes(d.mode as RouteMode) ? (d.mode as RouteMode) : "balanced";
    return {
      origin: [d.origin[0], d.origin[1]],
      destination: [d.destination[0], d.destination[1]],
      originName: cleanName(d.originName),
      destinationName: cleanName(d.destinationName),
      mode,
      navigating: d.navigating === true,
    };
  } catch {
    return null;
  }
}

export function saveTrip(trip: SavedTrip | null) {
  try {
    if (!trip) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ ...trip, savedAt: Date.now() }));
  } catch {
    /* storage unavailable (private mode); refresh just starts over */
  }
}
