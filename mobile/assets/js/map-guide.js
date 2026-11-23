// Along — plain walking steps from the road geometry of a route.
// The shell's route search returns the line and each leg's length and time but no instruction
// text, so the steps are derived from the line itself: how far it runs and which way it bends.
// They describe the drawn route; they are not voice navigation and know no street names.

const EARTH = 6371000;
const rad = (deg) => deg * Math.PI / 180;
const valid = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass bearing in degrees: 0 is north, clockwise.
export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const compassOf = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function pathMeters(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
  return total;
}

// Usable points only, without repeats closer than a metre.
function cleanPath(path) {
  const points = [];
  for (const p of Array.isArray(path) ? path : []) {
    if (valid(p) && (!points.length || distanceMeters(points.at(-1), p) >= 1)) points.push({ lat: p.lat, lng: p.lng });
  }
  return points;
}

// Douglas-Peucker on a local flat projection: which points are real corners, not wobble.
function cornerIndices(points, tolerance) {
  if (points.length < 3) return points.map((_, i) => i);
  const scale = Math.cos(rad(points[0].lat)), flat = points.map((p) => [rad(p.lng) * scale * EARTH, rad(p.lat) * EARTH]);
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    const [ax, ay] = flat[from], [bx, by] = flat[to], dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    let worst = 0, index = -1;
    for (let i = from + 1; i < to; i++) {
      const [px, py] = flat[i];
      const d = length ? Math.abs(dy * (px - ax) - dx * (py - ay)) / length : Math.hypot(px - ax, py - ay);
      if (d > worst) { worst = d; index = i; }
    }
    if (index > 0 && worst > tolerance) { keep[index] = 1; stack.push([from, index], [index, to]); }
  }
  return points.map((_, i) => i).filter((i) => keep[i]);
}

export function simplifyPath(path, tolerance = 8) {
  const points = cleanPath(path);
  return cornerIndices(points, tolerance).map((i) => points[i]);
}

// How a bend of `delta` degrees reads (negative: to the left, positive: to the right).
export function turnKind(delta, straight = 30) {
  const size = Math.abs(delta), side = delta < 0 ? 'left' : 'right';
  if (size < straight) return 'straight';
  if (size >= 165) return 'uturn';
  if (size < 60) return `slight_${side}`;
  if (size <= 135) return side;
  return `sharp_${side}`;
}

// -> [{ type: 'depart', compass, meters }, { type: 'left' | 'right' | ..., meters }, ..., { type: 'arrive' }]
// Directions come from the corners of the line; distances are measured along the line as
// drawn, so the steps add up to the walk. A jog shorter than `minLeg` between two bends is
// folded into the walk around it, so crossing a road is not announced as two turns.
export function routeSteps(path, { tolerance = 8, straight = 30, minLeg = 20 } = {}) {
  const points = cleanPath(path), corners = cornerIndices(points, tolerance);
  if (corners.length < 2) return [];
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + distanceMeters(points[i - 1], points[i]));
  const legs = [];
  let carried = 0;
  for (let i = 1; i < corners.length; i++) {
    const from = corners[i - 1], to = corners[i], meters = along[to] - along[from];
    const last = i === corners.length - 1;
    if (meters < minLeg && legs.length && !last) { carried += meters; continue; }
    legs.push({ meters: meters + carried, heading: bearing(points[from], points[to]) });
    carried = 0;
  }
  // A short final stretch belongs to the walk before it.
  if (legs.length > 1 && legs.at(-1).meters < minLeg) { const tail = legs.pop(); legs.at(-1).meters += tail.meters; }
  const steps = [{ type: 'depart', compass: compassOf(legs[0].heading), meters: legs[0].meters }];
  for (let i = 1; i < legs.length; i++) {
    const delta = ((legs[i].heading - legs[i - 1].heading + 540) % 360) - 180;
    const kind = turnKind(delta, straight);
    if (kind === 'straight') steps.at(-1).meters += legs[i].meters;
    else steps.push({ type: kind, meters: legs[i].meters });
  }
  steps.push({ type: 'arrive' });
  return steps;
}

// 43 -> { n: 45, unit: 'm' }, 870 -> { n: 870, unit: 'm' }, 1234 -> { n: '1.2', unit: 'km' }
export function distanceParts(meters) {
  const value = Math.max(0, Number(meters) || 0);
  if (value >= 995) return { n: (value / 1000).toFixed(value >= 9950 ? 0 : 1), unit: 'km' };
  const step = value < 100 ? 5 : 10;
  return { n: Math.max(step, Math.round(value / step) * step), unit: 'm' };
}

// 65 s -> { h: 0, m: 1 }; anything above zero is at least one minute.
export function durationParts(seconds) {
  const minutes = Math.max(seconds > 0 ? 1 : 0, Math.round((Number(seconds) || 0) / 60));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
