export type RouteMode = "safest" | "fastest" | "balanced";
export type SelectingMode = "origin" | "destination" | null;

export interface RouteSegment {
  geometry: GeoJSON.LineString;
  risk: number;
}

export interface RouteResult {
  geometry: GeoJSON.LineString;
  distance_m: number;
  duration_s: number;
  risk_score: number;
  segments: RouteSegment[];
}

export interface RoutesResponse {
  safest: RouteResult | null;
  fastest: RouteResult | null;
  balanced: RouteResult | null;
}

export interface IncidentMeta {
  incident_count: number;
  data_from: string | null;    // ISO date, e.g. "2023-11-16"
  data_through: string | null; // ISO date of the newest incident
}

export interface IncidentCollection {
  type: "FeatureCollection";
  // Incidents at the same location are merged; weight = sum of their severities.
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Point;
    properties: { weight: number };
  }>;
  meta?: IncidentMeta;
}

export interface RiskSegmentCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.LineString;
    properties: { risk: number };
  }>;
}

export interface GeocodeSuggestion {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}
