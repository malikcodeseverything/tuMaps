// Progress along a walking route, measured from the walker's position.
// Uses a local flat projection, which is accurate to well under a metre
// at the scale of a campus walk.

const EARTH_RADIUS_M = 6_371_000;
// Same walking speed the routing graph uses (4.5 km/h).
export const WALK_SPEED_MPS = 4.5 / 3.6;
export const ARRIVED_WITHIN_M = 20;
export const OFF_ROUTE_AFTER_M = 45;

type LngLat = [number, number];

function toMetres(p: LngLat, lat0: number): [number, number] {
  const rad = Math.PI / 180;
  return [p[0] * rad * EARTH_RADIUS_M * Math.cos(lat0 * rad), p[1] * rad * EARTH_RADIUS_M];
}

export interface RouteProgress {
  /** Distance still to walk along the route, from the closest point on it. */
  remainingM: number;
  /** How far the walker is from the route line. */
  offRouteM: number;
}

export function progressAlong(line: LngLat[], position: LngLat): RouteProgress | null {
  if (line.length === 0) return null;
  const lat0 = position[1];
  const pts = line.map((p) => toMetres(p, lat0));
  const [px, py] = toMetres(position, lat0);
  if (pts.length === 1) {
    const d = Math.hypot(pts[0][0] - px, pts[0][1] - py);
    return { remainingM: d, offRouteM: d };
  }

  const segLen = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  let best = { dist: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < segLen.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
    const dist = Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py);
    if (dist < best.dist) best = { dist, seg: i, t };
  }

  let remaining = segLen[best.seg] * (1 - best.t);
  for (let i = best.seg + 1; i < segLen.length; i++) remaining += segLen[i];
  return { remainingM: remaining, offRouteM: best.dist };
}
