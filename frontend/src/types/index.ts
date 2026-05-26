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
  risk_label: string;
  risk_percentile: number;
  max_segment_risk: number;
  max_segment_risk_label: string;
  max_segment_risk_percentile: number;
  elevated_segment_count: number;
  segments: RouteSegment[];
}

export interface RoutesResponse {
  safest: RouteResult | null;
  fastest: RouteResult | null;
  balanced: RouteResult | null;
}

export interface IncidentCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Point;
    properties: { severity: number; type: string; date: string };
  }>;
}

export interface RiskSegmentCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.LineString;
    properties: { risk: number; name: string };
  }>;
}

export interface GeocodeSuggestion {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}
