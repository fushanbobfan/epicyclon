// Plan a raster (PNG) export of a traced curve.
//
// `svg.js` writes the reconstructed curve as a vector document; this module is
// its bitmap sibling. It does no drawing — a browser canvas is needed for
// that — but it works out everything a painter needs and hands back a plain
// object: the output pixel size, a background, a stroke style, and the curve
// resampled into bitmap coordinates. Keeping that arithmetic here means it can
// be unit tested without a canvas, exactly like the SVG builder.
//
// Input points use the renderer's canvas-centered coordinates (x right, y
// down). The plan fits the curve to its bounding box with a uniform margin,
// scales it up by an optional device pixel ratio, and caps the longest edge so
// a huge drawing cannot ask for a gigapixel image.

const DEFAULTS = {
  /** blank margin around the curve, in curve units (pre-scale) */
  padding: 16,
  /** device pixel ratio: multiply the logical size for a crisp export */
  pixelRatio: 1,
  /** hard cap on the longest output edge, in pixels */
  maxSize: 2048,
  /** floor on the longest output edge, in pixels */
  minSize: 64,
  /** solid page color behind the curve, or null for a transparent PNG */
  background: null,
  /** stroke color for the curve */
  stroke: '#2f6fed',
  /** stroke width, in output pixels (not scaled with the curve) */
  strokeWidth: 2,
  /** close the polyline back to its first point */
  closed: true,
  /** decimal places kept on mapped coordinates */
  precision: 3,
};

/**
 * Build a raster export plan for a traced curve.
 *
 * @param {Array<{x:number, y:number}>} points  pen positions around one loop
 * @param {Partial<typeof DEFAULTS>} [opts]
 * @returns {{
 *   width: number,
 *   height: number,
 *   scale: number,
 *   background: string | null,
 *   stroke: string,
 *   strokeWidth: number,
 *   closed: boolean,
 *   polyline: Array<{x:number, y:number}>,
 * }}
 */
export function rasterPlan(points, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const precision = clampPrecision(cfg.precision);
  const pad = finitePositive(cfg.padding, 0);
  const ratio = finitePositive(cfg.pixelRatio, 1);
  const maxSize = Math.max(1, Math.floor(finitePositive(cfg.maxSize, DEFAULTS.maxSize)));
  const minSize = Math.max(1, Math.floor(finitePositive(cfg.minSize, 1)));

  const clean = Array.isArray(points)
    ? points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];

  const bounds = boundsOf(clean);
  const contentW = bounds.w + pad * 2;
  const contentH = bounds.h + pad * 2;

  // Logical size, then the device scale, then fit inside [minSize, maxSize]
  // on the longest edge while holding the aspect ratio.
  let scale = ratio;
  let longest = Math.max(contentW, contentH) * scale;
  if (longest > maxSize) scale *= maxSize / longest;
  longest = Math.max(contentW, contentH) * scale;
  if (minSize <= maxSize && longest < minSize) scale *= minSize / longest;

  const width = Math.max(1, Math.round(contentW * scale));
  const height = Math.max(1, Math.round(contentH * scale));
  // Re-derive the scale from the rounded width so mapped points land exactly
  // inside the bitmap even after the round.
  const mapScale = width / contentW;

  const shift = (p) => ({
    x: round((p.x - bounds.minX + pad) * mapScale, precision),
    y: round((p.y - bounds.minY + pad) * mapScale, precision),
  });

  return {
    width,
    height,
    scale: round(mapScale, 6),
    background: cfg.background || null,
    stroke: cfg.stroke,
    strokeWidth: finitePositive(cfg.strokeWidth, DEFAULTS.strokeWidth),
    closed: Boolean(cfg.closed) && clean.length >= 3,
    polyline: clean.map(shift),
  };
}

/** Axis-aligned bounds of a point list, with a minimum 1x1 extent. */
function boundsOf(pts) {
  if (pts.length === 0) return { minX: 0, minY: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    w: Math.max(maxX - minX, 1),
    h: Math.max(maxY - minY, 1),
  };
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampPrecision(value) {
  if (!Number.isFinite(value)) return 3;
  return Math.min(6, Math.max(0, Math.floor(value)));
}

function round(value, precision) {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}
