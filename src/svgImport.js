// Turn an SVG document into a traceable polyline — the counterpart to
// svg.js's export. A dropped or pasted SVG usually has one path drawn by a
// vector editor; this pulls out its `d` attribute, flattens any curves to
// line segments, and hands back plain points centered and scaled the same
// way the built-in example shapes are, so it can go straight into
// `resample` and then the DFT.
//
// Supports M/L/H/V/C/S/Q/T/A/Z (absolute and relative) and multiple subpaths
// (the largest by bounding-box area is used). Elliptical arcs (`A`) are
// flattened with the endpoint-to-center parameterization from the SVG spec
// (appendix F.6), the same way cubic and quadratic curves are flattened to
// line segments.

const CURVE_SEGMENTS = 24;

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

const COMMAND_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * Find every `<path d="...">` value in an SVG document, in document order.
 *
 * @param {string} svgText
 * @returns {string[]}
 */
export function extractPathDataStrings(svgText) {
  if (typeof svgText !== 'string') return [];
  const out = [];
  const re = /<path\b[^>]*\bd\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(svgText))) {
    out.push(m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

/**
 * Parse a `d` attribute into one polyline per subpath (one entry per `M`).
 * Malformed input is parsed as far as it can be and the rest discarded;
 * completely unparseable input returns an empty array.
 *
 * @param {string} d
 * @returns {Array<Array<{x:number, y:number}>>}
 */
export function parsePathData(d) {
  if (typeof d !== 'string') return [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens || tokens.length === 0) return [];

  const subpaths = [];
  let points = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCubicCtrl = null;
  let prevQuadCtrl = null;
  let cmd = null;
  let idx = 0;
  const maxIterations = tokens.length * 2 + 10;
  let iterations = 0;

  const takeNums = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      if (idx >= tokens.length || COMMAND_RE.test(tokens[idx])) return null;
      out.push(Number(tokens[idx]));
      idx++;
    }
    return out;
  };

  const startSubpath = () => {
    if (points.length > 0) subpaths.push(points);
    points = [];
  };

  while (idx < tokens.length) {
    if (++iterations > maxIterations) break;

    const t = tokens[idx];
    if (COMMAND_RE.test(t)) {
      cmd = t;
      idx++;
    }
    if (!cmd) break;

    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;

    if (upper === 'Z') {
      if (points.length > 0) points.push({ x: sx, y: sy });
      cx = sx;
      cy = sy;
      startSubpath();
      cmd = null;
      prevCubicCtrl = null;
      prevQuadCtrl = null;
      continue;
    }

    const nums = takeNums(ARITY[upper]);
    if (nums === null) break;

    switch (upper) {
      case 'M': {
        const [x, y] = nums;
        cx = relative ? cx + x : x;
        cy = relative ? cy + y : y;
        startSubpath();
        sx = cx;
        sy = cy;
        points.push({ x: cx, y: cy });
        cmd = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const [x, y] = nums;
        cx = relative ? cx + x : x;
        cy = relative ? cy + y : y;
        points.push({ x: cx, y: cy });
        break;
      }
      case 'H': {
        const [x] = nums;
        cx = relative ? cx + x : x;
        points.push({ x: cx, y: cy });
        break;
      }
      case 'V': {
        const [y] = nums;
        cy = relative ? cy + y : y;
        points.push({ x: cx, y: cy });
        break;
      }
      case 'C': {
        const [x1, y1, x2, y2, x, y] = nums;
        const c1 = relative ? { x: cx + x1, y: cy + y1 } : { x: x1, y: y1 };
        const c2 = relative ? { x: cx + x2, y: cy + y2 } : { x: x2, y: y2 };
        const end = relative ? { x: cx + x, y: cy + y } : { x, y };
        appendCubic(points, { x: cx, y: cy }, c1, c2, end);
        prevCubicCtrl = c2;
        cx = end.x;
        cy = end.y;
        break;
      }
      case 'S': {
        const [x2, y2, x, y] = nums;
        const c1 = prevCubicCtrl ? reflect({ x: cx, y: cy }, prevCubicCtrl) : { x: cx, y: cy };
        const c2 = relative ? { x: cx + x2, y: cy + y2 } : { x: x2, y: y2 };
        const end = relative ? { x: cx + x, y: cy + y } : { x, y };
        appendCubic(points, { x: cx, y: cy }, c1, c2, end);
        prevCubicCtrl = c2;
        cx = end.x;
        cy = end.y;
        break;
      }
      case 'Q': {
        const [x1, y1, x, y] = nums;
        const c1 = relative ? { x: cx + x1, y: cy + y1 } : { x: x1, y: y1 };
        const end = relative ? { x: cx + x, y: cy + y } : { x, y };
        appendQuad(points, { x: cx, y: cy }, c1, end);
        prevQuadCtrl = c1;
        cx = end.x;
        cy = end.y;
        break;
      }
      case 'T': {
        const [x, y] = nums;
        const c1 = prevQuadCtrl ? reflect({ x: cx, y: cy }, prevQuadCtrl) : { x: cx, y: cy };
        const end = relative ? { x: cx + x, y: cy + y } : { x, y };
        appendQuad(points, { x: cx, y: cy }, c1, end);
        prevQuadCtrl = c1;
        cx = end.x;
        cy = end.y;
        break;
      }
      case 'A': {
        const [rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y] = nums;
        const end = { x: relative ? cx + x : x, y: relative ? cy + y : y };
        appendArc(points, { x: cx, y: cy }, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, end);
        cx = end.x;
        cy = end.y;
        break;
      }
    }

    if (upper !== 'C' && upper !== 'S') prevCubicCtrl = null;
    if (upper !== 'Q' && upper !== 'T') prevQuadCtrl = null;
  }

  if (points.length > 0) subpaths.push(points);
  return subpaths;
}

/**
 * Extract the single most prominent subpath from an SVG document: every
 * `<path>` is parsed and the subpath with the largest bounding-box area
 * wins, so a background rect-as-path or a decorative dot doesn't get
 * chosen over the actual drawing.
 *
 * @param {string} svgText
 * @returns {Array<{x:number, y:number}>} empty when nothing usable is found
 */
export function svgToPoints(svgText) {
  let best = [];
  let bestArea = -1;
  for (const d of extractPathDataStrings(svgText)) {
    for (const subpath of parsePathData(d)) {
      const area = bboxArea(subpath);
      if (area > bestArea) {
        bestArea = area;
        best = subpath;
      }
    }
  }
  return best;
}

/**
 * Recenter a polyline on its bounding-box center and uniformly scale it so
 * its longest dimension equals `span` — the same convention `shapes.js`
 * uses for its `size` parameter.
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {number} span
 * @returns {Array<{x:number, y:number}>}
 */
export function fitToSpan(points, span) {
  if (!Array.isArray(points) || points.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const longest = Math.max(maxX - minX, maxY - minY);
  const scale = longest > 0 && Number.isFinite(span) && span > 0 ? span / longest : 1;
  return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

function appendCubic(points, p0, p1, p2, p3) {
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const e = t * t * t;
    points.push({
      x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
    });
  }
}

function appendQuad(points, p0, p1, p2) {
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS;
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;
    points.push({
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
    });
  }
}

/**
 * Flatten an SVG elliptical arc (`A`) into line segments using the
 * endpoint-to-center parameterization from the SVG spec (appendix F.6.5).
 * Degenerate input (zero radius, or a start point equal to the end point)
 * falls back to a straight line, matching the spec's own fallback rules.
 */
function appendArc(points, start, rx, ry, xAxisRotationDeg, largeArcFlag, sweepFlag, end) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (start.x === end.x && start.y === end.y)) {
    points.push(end);
    return;
  }

  const phi = ((xAxisRotationDeg % 360) + 360) % 360 * (Math.PI / 180);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const large = largeArcFlag !== 0;
  const sweep = sweepFlag !== 0;

  const dx2 = (start.x - end.x) / 2;
  const dy2 = (start.y - end.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const sign = large === sweep ? -1 : 1;
  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const co = sign * Math.sqrt(num / (rxSq * y1pSq + rySq * x1pSq));
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (-co * (ry * x1p)) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;

  const angle = (ux, uy, vx, vy) => {
    const sgn = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / Math.hypot(ux, uy) / Math.hypot(vx, vy)));
    return sgn * Math.acos(dot);
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const theta = theta1 + (dtheta * i) / CURVE_SEGMENTS;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    points.push({
      x: cx + rx * cosPhi * cosTheta - ry * sinPhi * sinTheta,
      y: cy + rx * sinPhi * cosTheta + ry * cosPhi * sinTheta,
    });
  }
}

function reflect(center, point) {
  return { x: 2 * center.x - point.x, y: 2 * center.y - point.y };
}

function bboxArea(points) {
  if (points.length === 0) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(maxX - minX, 0) * Math.max(maxY - minY, 0);
}
