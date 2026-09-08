// Shareable permalinks.
//
// The whole viewer state that matters for reproducing a drawing fits in the
// URL hash: which source curve is shown (a named preset or a custom stroke),
// how many Fourier terms are kept, the playback speed, and which layers are
// visible. `encodeState` packs that into a short, URL-safe string and
// `decodeState` parses it back, tolerating anything malformed by returning
// null so the caller can fall back to defaults.
//
// Wire format (version 1):
//
//   1~<source>~t<terms>~s<speedHundredths>~f<flagBits>
//
//   source   p:<name>                     a preset shape by key
//            c:<count>,<x0>,<y0>,<x1>,...  a custom stroke, integer coords
//   terms    integer >= 1
//   speed    playback rate * 100, integer (150 == 1.5x)
//   flags    bit 1 circles, bit 2 chain/radii, bit 4 original path
//
// Custom strokes are rounded to whole units on the canvas-centered grid, so a
// decoded path lands within one pixel of the original. Callers resample the
// result anyway, so the exact point count is advisory.

export const SHARE_VERSION = 1;

const FLAG_CIRCLES = 1;
const FLAG_CHAIN = 2;
const FLAG_INPUT = 4;

const MAX_TERMS = 4096;
const MAX_SPEED = 3;
const MAX_POINTS = 4000;

/**
 * Pack viewer state into a hash string (no leading '#').
 *
 * @param {{
 *   shape?: string | null,
 *   path?: Array<{x:number, y:number}>,
 *   termCount?: number,
 *   speed?: number,
 *   show?: {circles?: boolean, chain?: boolean, input?: boolean},
 * }} state
 * @returns {string}
 */
export function encodeState(state = {}) {
  const { shape, path, termCount = 64, speed = 1, show = {} } = state;

  let source;
  if (shape && typeof shape === 'string') {
    source = `p:${encodeURIComponent(shape)}`;
  } else if (Array.isArray(path) && path.length > 0) {
    const pts = path.slice(0, MAX_POINTS);
    const coords = new Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) {
      coords[i * 2] = Math.round(pts[i].x);
      coords[i * 2 + 1] = Math.round(pts[i].y);
    }
    source = `c:${pts.length},${coords.join(',')}`;
  } else {
    source = 'p:';
  }

  const terms = clampInt(termCount, 1, MAX_TERMS, 64);
  const speedHundredths = clampInt(Math.round(speed * 100), 0, MAX_SPEED * 100, 100);
  const flags =
    (show.circles ? FLAG_CIRCLES : 0) |
    (show.chain ? FLAG_CHAIN : 0) |
    (show.input ? FLAG_INPUT : 0);

  return `${SHARE_VERSION}~${source}~t${terms}~s${speedHundredths}~f${flags}`;
}

/**
 * Parse a hash string produced by `encodeState`. Accepts an optional leading
 * '#'. Returns null when the string is empty, the wrong version, or otherwise
 * unparseable.
 *
 * @param {string} hash
 * @returns {{
 *   shape: string | null,
 *   path: Array<{x:number, y:number}> | null,
 *   termCount: number,
 *   speed: number,
 *   show: {circles: boolean, chain: boolean, input: boolean},
 * } | null}
 */
export function decodeState(hash) {
  if (typeof hash !== 'string') return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw.trim() === '') return null;

  const parts = raw.split('~');
  if (parts.length < 5) return null;
  if (parts[0] !== String(SHARE_VERSION)) return null;

  const source = parts[1];
  const termsField = parts[2];
  const speedField = parts[3];
  const flagsField = parts[4];

  if (!termsField.startsWith('t') || !speedField.startsWith('s') || !flagsField.startsWith('f')) {
    return null;
  }

  const termCount = clampInt(Number(termsField.slice(1)), 1, MAX_TERMS, 64);
  const speed = clampInt(Number(speedField.slice(1)), 0, MAX_SPEED * 100, 100) / 100;
  const flags = clampInt(Number(flagsField.slice(1)), 0, 7, 0);

  let shape = null;
  let path = null;

  if (source.startsWith('p:')) {
    const name = decodeURIComponent(source.slice(2));
    shape = name === '' ? null : name;
  } else if (source.startsWith('c:')) {
    path = parsePath(source.slice(2));
    if (path === null) return null;
  } else {
    return null;
  }

  return {
    shape,
    path,
    termCount,
    speed,
    show: {
      circles: (flags & FLAG_CIRCLES) !== 0,
      chain: (flags & FLAG_CHAIN) !== 0,
      input: (flags & FLAG_INPUT) !== 0,
    },
  };
}

/** Parse the `<count>,<x0>,<y0>,...` body of a custom source. */
function parsePath(body) {
  const nums = body.split(',');
  if (nums.length < 1) return null;

  const count = Number(nums[0]);
  if (!Number.isInteger(count) || count <= 0 || count > MAX_POINTS) return null;
  if (nums.length !== count * 2 + 1) return null;

  const points = new Array(count);
  for (let i = 0; i < count; i++) {
    const x = Number(nums[1 + i * 2]);
    const y = Number(nums[2 + i * 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points[i] = { x, y };
  }
  return points;
}

function clampInt(value, lo, hi, fallback) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < lo) return lo;
  if (rounded > hi) return hi;
  return rounded;
}
