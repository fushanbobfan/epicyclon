// Turn a traced curve into a standalone SVG document.
//
// The epicycle chain reconstructs a smooth approximation of the drawn shape;
// sampling its pen position around one loop gives a plain polyline. This module
// wraps that polyline in a minimal, self-contained SVG so it can be opened in a
// vector editor, printed, or sent to a pen plotter.
//
// Input points are in the same canvas-centered coordinates the renderer uses
// (x right, y down). The output viewBox is shifted so the drawing sits at the
// origin with a uniform margin, and no external stylesheet or font is needed.

const DEFAULTS = {
  /** close the path back to the first point with a Z command */
  closed: true,
  /** blank margin around the curve, in user units */
  padding: 8,
  /** decimal places kept on every coordinate */
  precision: 2,
  stroke: '#2f6fed',
  strokeWidth: 2,
  /** solid page color behind the curve, or null for a transparent SVG */
  background: null,
  /** <title> text, for accessibility and editor tab labels */
  title: 'epicyclon curve',
};

/**
 * Build an SVG document string for a traced curve.
 *
 * @param {Array<{x:number, y:number}>} points  pen positions around one loop
 * @param {Partial<typeof DEFAULTS>} [opts]
 * @returns {string} a complete `<svg>...</svg>` document
 */
export function curveToSvg(points, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const precision = clampPrecision(cfg.precision);
  const pad = Number.isFinite(cfg.padding) && cfg.padding > 0 ? cfg.padding : 0;

  const clean = Array.isArray(points)
    ? points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];

  const bounds = boundsOf(clean);
  const width = round(bounds.w + pad * 2, precision);
  const height = round(bounds.h + pad * 2, precision);

  const shift = (p) => ({
    x: p.x - bounds.minX + pad,
    y: p.y - bounds.minY + pad,
  });

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${width}" height="${height}">`,
    `<title>${escapeText(cfg.title)}</title>`,
  ];

  if (cfg.background) {
    parts.push(
      `<rect width="${width}" height="${height}" fill="${escapeAttr(cfg.background)}"/>`,
    );
  }

  if (clean.length >= 2) {
    parts.push(
      `<path d="${pathData(clean.map(shift), precision, cfg.closed)}" ` +
        `fill="none" stroke="${escapeAttr(cfg.stroke)}" ` +
        `stroke-width="${cfg.strokeWidth}" stroke-linejoin="round" ` +
        `stroke-linecap="round"/>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * The `d` attribute for a polyline: one move, then a line to each later point,
 * optionally closed.
 *
 * @param {Array<{x:number, y:number}>} pts
 * @param {number} precision
 * @param {boolean} closed
 * @returns {string}
 */
export function pathData(pts, precision = 2, closed = true) {
  if (!Array.isArray(pts) || pts.length === 0) return '';
  // String() already drops trailing zeros: 1.50 -> "1.5", 2.0 -> "2".
  const n = (v) => String(round(v, precision));
  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${n(pts[i].x)} ${n(pts[i].y)}`;
  }
  if (closed && pts.length >= 3) d += ' Z';
  return d;
}

/** Axis-aligned bounds of a point list, with a minimum 1x1 extent. */
function boundsOf(pts) {
  if (pts.length === 0) {
    return { minX: 0, minY: 0, w: 1, h: 1 };
  }
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

function clampPrecision(value) {
  if (!Number.isFinite(value)) return 2;
  return Math.min(6, Math.max(0, Math.floor(value)));
}

function round(value, precision) {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
