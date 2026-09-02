// Evaluate a chain of rotating vectors (epicycles) produced by `dft`.

/**
 * Position of term `n` at time `t`.
 *
 * @param {{freq:number, amp:number, phase:number}} term
 * @param {number} t  loop position in [0, 1)
 * @returns {{x:number, y:number}} vector contribution for this term
 */
export function termVector(term, t) {
  const angle = term.freq * 2 * Math.PI * t + term.phase;
  return {
    x: term.amp * Math.cos(angle),
    y: term.amp * Math.sin(angle),
  };
}

/**
 * Walk the epicycle chain at time `t`, returning every circle center plus the
 * final pen tip. With `k` terms the result has `k + 1` points: index 0 is the
 * chain origin and the last entry is the traced point.
 *
 * @param {Array<{freq:number, amp:number, phase:number}>} terms
 * @param {number} t  loop position in [0, 1)
 * @param {{x:number, y:number}} [origin]
 * @returns {Array<{x:number, y:number}>}
 */
export function chainPoints(terms, t, origin = { x: 0, y: 0 }) {
  const pts = [{ x: origin.x, y: origin.y }];
  let { x, y } = origin;
  for (const term of terms) {
    const v = termVector(term, t);
    x += v.x;
    y += v.y;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Just the traced pen position at time `t` (the tip of the chain).
 *
 * @param {Array<{freq:number, amp:number, phase:number}>} terms
 * @param {number} t
 * @param {{x:number, y:number}} [origin]
 * @returns {{x:number, y:number}}
 */
export function penPosition(terms, t, origin = { x: 0, y: 0 }) {
  let x = origin.x;
  let y = origin.y;
  for (const term of terms) {
    const angle = term.freq * 2 * Math.PI * t + term.phase;
    x += term.amp * Math.cos(angle);
    y += term.amp * Math.sin(angle);
  }
  return { x, y };
}

/**
 * Sample the traced curve at `steps` evenly spaced times over one loop.
 *
 * @param {Array<{freq:number, amp:number, phase:number}>} terms
 * @param {number} steps
 * @param {{x:number, y:number}} [origin]
 * @returns {Array<{x:number, y:number}>}
 */
export function tracePath(terms, steps, origin = { x: 0, y: 0 }) {
  if (steps <= 0) return [];
  const out = [];
  for (let i = 0; i < steps; i++) {
    out.push(penPosition(terms, i / steps, origin));
  }
  return out;
}
