// Turn an SVG document into a traceable polyline — the counterpart to
// svg.js's export. A dropped or pasted SVG usually has one path drawn by a
// vector editor; this pulls out its `d` attribute, flattens any curves to
// line segments, and hands back plain points centered and scaled the same
// way the built-in example shapes are, so it can go straight into
// `resample` and then the DFT.
//
// Supports M/L/H/V/C/S/Q/T/Z (absolute and relative) and multiple subpaths
// (the largest by bounding-box area is used). Elliptical arcs (`A`) are
// approximated as a straight line to the arc's endpoint, since a faithful
// arc-to-bezier conversion isn't worth the complexity here.

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
        const x = nums[5];
        const y = nums[6];
        cx = relative ? cx + x : x;
        cy = relative ? cy + y : y;
        points.push({ x: cx, y: cy });
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
