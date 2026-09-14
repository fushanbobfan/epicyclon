// Turn a traced curve into a self-contained, looping animated SVG: the same closed polyline
// curveToSvg() draws as a static guide, plus a small dot traced along that exact path with
// SMIL's <animateMotion> — so the file loops the pen motion on its own in any browser or
// SVG-aware viewer, no external script or stylesheet needed.
//
// Reuses curveToSvg's own bounds/padding/precision framing (via svg.js's exported helpers) so
// the two exports agree pixel-for-pixel on where the curve sits in the document; the only new
// ingredient is the motion animation itself.

import { pathData, boundsOf, round, clampPrecision, escapeText, escapeAttr } from './svg.js';

const DEFAULTS = {
  /** close the path back to the first point with a Z command */
  closed: true,
  /** blank margin around the curve, in user units */
  padding: 8,
  /** decimal places kept on every coordinate */
  precision: 2,
  stroke: '#2f6fed',
  strokeWidth: 2,
  /** opacity of the static guide curve the dot traces — faint, so the moving dot reads as the
   *  focal point rather than competing with a solid outline */
  guideOpacity: 0.25,
  /** radius of the animated pen-position dot, in user units */
  penRadius: 5,
  /** solid page color behind the curve, or null for a transparent SVG */
  background: null,
  /** <title> text, for accessibility and editor tab labels */
  title: 'epicyclon animated curve',
  /** seconds for one full loop of the dot around the path */
  durationSeconds: 6,
};

/**
 * Build a looping animated SVG document string for a traced curve.
 *
 * @param {Array<{x:number, y:number}>} points  pen positions around one loop
 * @param {Partial<typeof DEFAULTS>} [opts]
 * @returns {string} a complete `<svg>...</svg>` document
 */
export function curveToAnimatedSvg(points, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const precision = clampPrecision(cfg.precision);
  const pad = Number.isFinite(cfg.padding) && cfg.padding > 0 ? cfg.padding : 0;
  const duration =
    Number.isFinite(cfg.durationSeconds) && cfg.durationSeconds > 0
      ? cfg.durationSeconds
      : DEFAULTS.durationSeconds;
  const penRadius =
    Number.isFinite(cfg.penRadius) && cfg.penRadius > 0 ? cfg.penRadius : DEFAULTS.penRadius;

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
    const d = pathData(clean.map(shift), precision, cfg.closed);
    parts.push(
      `<path d="${d}" fill="none" stroke="${escapeAttr(cfg.stroke)}" ` +
        `stroke-width="${cfg.strokeWidth}" stroke-linejoin="round" ` +
        `stroke-linecap="round" stroke-opacity="${cfg.guideOpacity}"/>`,
    );
    // A dot at the path's own origin (0,0 in its local coordinate system, since animateMotion
    // translates the element rather than repositioning its geometry) traced along the identical
    // `d` data the guide path above already uses — same start point, same direction, and (since
    // the path is closed) a seamless loop back to the start with no jump at the wrap-around.
    parts.push(
      `<circle r="${penRadius}" fill="${escapeAttr(cfg.stroke)}">` +
        `<animateMotion dur="${duration}s" repeatCount="indefinite" path="${d}"/>` +
        `</circle>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
