// Arc-length resampling of a polyline.
//
// A hand-drawn stroke has clumps of points where the pointer moved slowly and
// gaps where it moved fast. Feeding that straight into the DFT makes playback
// speed up and slow down around the loop. Resampling to evenly spaced points
// along the arc length fixes that, and also lets the caller pick a fixed
// sample count (a power of two keeps the transform tidy).

/**
 * Total length of a polyline.
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {boolean} [closed] include the segment from the last point back to
 *   the first
 */
export function pathLength(points, closed = false) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
  }
  if (closed && points.length > 1) {
    total += dist(points[points.length - 1], points[0]);
  }
  return total;
}

/**
 * Resample a polyline to `count` points spaced equally along its arc length.
 *
 * @param {Array<{x:number, y:number}>} points  at least one input point
 * @param {number} count  number of output points (>= 1)
 * @param {object} [opts]
 * @param {boolean} [opts.closed]  treat the stroke as a loop; the return walks
 *   from the start, around, and stops just before closing so the samples are
 *   not duplicated at the seam
 * @returns {Array<{x:number, y:number}>}
 */
export function resample(points, count, opts = {}) {
  const { closed = false } = opts;
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('resample needs at least one point');
  }
  if (count <= 0) return [];
  if (points.length === 1 || count === 1) {
    return Array.from({ length: count }, () => ({ ...points[0] }));
  }

  const verts = closed ? [...points, points[0]] : points;
  const total = pathLength(verts, false);

  if (total === 0) {
    return Array.from({ length: count }, () => ({ ...points[0] }));
  }

  // Cumulative distance at each vertex.
  const cum = [0];
  for (let i = 1; i < verts.length; i++) {
    cum.push(cum[i - 1] + dist(verts[i - 1], verts[i]));
  }

  const out = [];
  const denom = closed ? count : count - 1;
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / denom;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const f = segLen === 0 ? 0 : (target - cum[seg]) / segLen;
    out.push(lerp(verts[seg], verts[seg + 1], f));
  }
  return out;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, f) {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
