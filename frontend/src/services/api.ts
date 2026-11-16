import type { RoutesResponse, IncidentCollection, RiskSegmentCollection, GeocodeSuggestion } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Temple campus centre — biases geocoding results toward campus area
const PROXIMITY = "-75.1557,39.9812";
const BBOX = "-75.25,39.90,-75.05,40.05";

const UNREACHABLE_MESSAGE = "Can't reach the TuMaps server. Please try again in a moment.";

// fetch() only rejects on network-level failures (server down, DNS, CORS),
// and browsers word those differently ("Load failed", "Failed to fetch").
// Normalise them into one readable message for the UI.
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, init);
  } catch {
    throw new Error(UNREACHABLE_MESSAGE);
  }
}

export async function fetchRoutes(
  origin: [number, number],
  destination: [number, number],
): Promise<RoutesResponse> {
  const res = await apiFetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Route calculation failed");
  }
  return res.json();
}

export async function fetchIncidents(): Promise<IncidentCollection> {
  const res = await apiFetch("/api/incidents");
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

export async function geocode(query: string): Promise<GeocodeSuggestion[]> {
  if (!query.trim() || !MAPBOX_TOKEN) return [];
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("proximity", PROXIMITY);
  url.searchParams.set("bbox", BBOX);
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f: { id: string; place_name: string; center: [number, number] }) => ({
    id: f.id,
    place_name: f.place_name,
    center: f.center,
  }));
}
