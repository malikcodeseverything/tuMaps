// The routable area: the backend's walking graph covers 2.2 km around this
// point (backend/app/services/graph.py CENTER and RADIUS_M). Search only
// offers places inside it, so every suggestion can actually be routed to.
export const COVERAGE_CENTER: [number, number] = [-75.1557, 39.9812]; // [lng, lat]
const GRAPH_RADIUS_M = 2200;
// A little margin so a place right at the edge still has paths around it.
const SEARCH_RADIUS_M = 2100;

const M_PER_DEG_LAT = 111_111;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((COVERAGE_CENTER[1] * Math.PI) / 180);

export function inCoverage([lng, lat]: [number, number]): boolean {
  const dy = (lat - COVERAGE_CENTER[1]) * M_PER_DEG_LAT;
  const dx = (lng - COVERAGE_CENTER[0]) * M_PER_DEG_LNG;
  return Math.hypot(dx, dy) <= SEARCH_RADIUS_M;
}

/** "minLng,minLat,maxLng,maxLat" around the graph, for the geocoder's bbox. */
export const COVERAGE_BBOX = [
  COVERAGE_CENTER[0] - GRAPH_RADIUS_M / M_PER_DEG_LNG,
  COVERAGE_CENTER[1] - GRAPH_RADIUS_M / M_PER_DEG_LAT,
  COVERAGE_CENTER[0] + GRAPH_RADIUS_M / M_PER_DEG_LNG,
  COVERAGE_CENTER[1] + GRAPH_RADIUS_M / M_PER_DEG_LAT,
]
  .map((v) => v.toFixed(4))
  .join(",");
