import type {
  RoutesResponse,
  IncidentCollection,
  RiskSegmentCollection,
  Place,
  HealthStatus,
} from "@/types";
import { COVERAGE_BBOX, inCoverage } from "./coverage";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Temple campus centre: biases geocoding results toward campus
const PROXIMITY = "-75.1557,39.9812";

const UNREACHABLE_MESSAGE = "Can't reach the TuMaps server. Please try again in a moment.";

// The backend sleeps when idle and takes a few seconds to wake. While it does,
// the host answers 502/503/504 (its error page has no CORS headers, so the
// browser often reports a plain network error instead). Both are retried
// until the server is up or the deadline passes.
const WAKE_DEADLINE_MS = 60_000;
const WAKING_STATUSES = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() against the API that waits out a cold start.
 * `onWaking` fires once, on the first failed attempt, so the UI can say
 * "Waking up the server…" instead of showing an error.
 */
async function apiFetch(path: string, init?: RequestInit, onWaking?: () => void): Promise<Response> {
  const deadline = Date.now() + WAKE_DEADLINE_MS;
  let delay = 1_000;
  let notified = false;

  for (;;) {
    try {
      const res = await fetch(`${API}${path}`, init);
      if (!WAKING_STATUSES.has(res.status) || Date.now() + delay > deadline) return res;
    } catch {
      if (Date.now() + delay > deadline) throw new Error(UNREACHABLE_MESSAGE);
    }
    if (!notified) {
      notified = true;
      onWaking?.();
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5_000);
  }
}

/**
 * Wake the backend and report its status. Called by the landing page the
 * moment it loads, so the server is usually ready before the map opens.
 */
export async function warmUp(onWaking?: () => void): Promise<HealthStatus> {
  const res = await apiFetch("/health", { cache: "no-store" }, onWaking);
  if (!res.ok) throw new Error(UNREACHABLE_MESSAGE);
  return res.json();
}

/** Fetch the map overlays into the browser's HTTP cache (they're cached for 10 min). */
export function prefetchOverlays(): void {
  for (const path of ["/api/incidents", "/api/segments/risk"]) {
    fetch(`${API}${path}`).catch(() => undefined);
  }
}

export async function fetchRoutes(
  origin: [number, number],
  destination: [number, number],
  onWaking?: () => void,
): Promise<RoutesResponse> {
  const res = await apiFetch(
    "/api/routes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination }),
    },
    onWaking,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Route calculation failed");
  }
  return res.json();
}

export async function fetchIncidents(onWaking?: () => void): Promise<IncidentCollection> {
  const res = await apiFetch("/api/incidents", undefined, onWaking);
  if (!res.ok) throw new Error("Failed to load incident data");
  return res.json();
}

export async function fetchRiskSegments(): Promise<RiskSegmentCollection> {
  const res = await apiFetch("/api/segments/risk");
  if (!res.ok) throw new Error("Failed to load road risk data");
  return res.json();
}

interface MapboxFeature {
  text?: string;
  address?: string;
  place_type?: string[];
  place_name: string;
}

// "Charles Library" for a place, "1801 N Broad St" for an address.
function shortPlaceName(f: MapboxFeature): string {
  if (f.place_type?.includes("address") && f.address && f.text) return `${f.address} ${f.text}`;
  return f.text || f.place_name.split(",")[0];
}

/** Nearest place or street address for a point picked on the map. */
export async function reverseGeocode([lng, lat]: [number, number]): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng.toFixed(6)},${lat.toFixed(6)}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("types", "poi,address");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const feature: MapboxFeature | undefined = data.features?.[0];
    return feature ? shortPlaceName(feature) : null;
  } catch {
    return null;
  }
}

/**
 * Street addresses and places from Mapbox, limited to the routable area.
 * Returns [] on any failure so search never breaks; an aborted request
 * (the user kept typing) rejects with an AbortError, which callers ignore.
 */
export async function geocode(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (!query.trim() || !MAPBOX_TOKEN) return [];
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("proximity", PROXIMITY);
  url.searchParams.set("bbox", COVERAGE_BBOX);
  url.searchParams.set("types", "poi,address");
  url.searchParams.set("limit", "5");

  let data: { features?: Array<MapboxFeature & { id: string; center: [number, number] }> };
  try {
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return [];
    data = await res.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    return [];
  }

  return (data.features || [])
    .filter((f) => inCoverage(f.center))
    .map((f) => {
      const name = shortPlaceName(f);
      // "Charles Library, 1900 N 13th St, Philadelphia, ..." -> "1900 N 13th St, Philadelphia, ..."
      const detail = f.place_name
        .split(", ")
        .slice(1)
        .filter((part) => part !== "United States")
        .join(", ");
      return { id: f.id, name, detail, center: f.center, source: "mapbox" as const };
    });
}
