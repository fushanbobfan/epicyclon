// Discrete Fourier transform for closed 2D paths.
//
// A path is given as an array of points `{ x, y }`. Each point is treated as a
// complex number `x + iy`. The forward transform produces one term per input
// sample; every term is a rotating vector described by:
//
//   freq  - integer cycles per full loop (can be negative)
//   amp   - length of the vector (>= 0)
//   phase - starting angle in radians, in (-PI, PI]
//
// Summing every term tip-to-tail at time `t` in [0, 1) reproduces the original
// samples exactly (to floating-point precision).

/**
 * Forward DFT of a list of 2D points.
 *
 * @param {Array<{x:number, y:number}>} points
 * @returns {Array<{freq:number, amp:number, phase:number, re:number, im:number}>}
 *   Terms ordered by frequency: 0, 1, -1, 2, -2, ... which keeps low
 *   frequencies (the coarse shape) first before any amplitude sorting.
 */
export function dft(points) {
  if (!Array.isArray(points)) {
    throw new TypeError('dft expects an array of points');
  }
  const N = points.length;
  if (N === 0) return [];

  const raw = [];
  for (let k = 0; k < N; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const { x, y } = points[n];
      // (x + i y) * (cos - i sin)
      re += x * cos + y * sin;
      im += y * cos - x * sin;
    }
    re /= N;
    im /= N;
    raw.push({
      freq: foldFrequency(k, N),
      amp: Math.hypot(re, im),
      phase: Math.atan2(im, re),
      re,
      im,
    });
  }

  raw.sort((a, b) => frequencyRank(a.freq) - frequencyRank(b.freq));
  return raw;
}

/**
 * Map a DFT bin index in [0, N) to a signed frequency centered on zero.
 * Bin k above N/2 represents the negative frequency k - N.
 */
export function foldFrequency(k, N) {
  return k > N / 2 ? k - N : k;
}

/**
 * Ordering key that interleaves positive and negative frequencies:
 * 0, 1, -1, 2, -2, 3, -3, ...
 */
export function frequencyRank(freq) {
  if (freq === 0) return 0;
  return freq > 0 ? 2 * freq - 1 : -2 * freq;
}

/**
 * Keep only the `count` highest-amplitude terms, preserving their relative
 * order. Ties are broken by lower absolute frequency so playback stays stable.
 *
 * @param {Array<{freq:number, amp:number}>} terms
 * @param {number} count
 */
export function topTerms(terms, count) {
  if (count >= terms.length) return terms.slice();
  if (count <= 0) return [];
  const indexed = terms.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    if (b.t.amp !== a.t.amp) return b.t.amp - a.t.amp;
    return Math.abs(a.t.freq) - Math.abs(b.t.freq);
  });
  const keep = new Set(indexed.slice(0, count).map((e) => e.i));
  return terms.filter((_, i) => keep.has(i));
}
