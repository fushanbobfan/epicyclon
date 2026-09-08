// Magnitude spectrum of a Fourier term set.
//
// Each epicycle is one frequency component; this turns the kept terms into a
// simple bar list so the viewer can see how amplitude falls off as terms are
// added. The direct-current term (frequency 0) only recenters the whole
// drawing, so it is left out of the spectrum.

/**
 * One bar per term, tallest first.
 *
 * @param {Array<{freq:number, amp:number}>} terms
 * @param {number} [limit]  keep at most this many bars (default: all)
 * @returns {Array<{freq:number, amp:number, rel:number}>}
 *   `rel` is the bar's amplitude over the largest amplitude in the result,
 *   so the first bar always has `rel === 1`.
 */
export function spectrumBars(terms, limit = Infinity) {
  if (!Array.isArray(terms) || terms.length === 0) return [];

  const usable = terms.filter(
    (t) => t && Number.isFinite(t.amp) && t.amp > 0 && t.freq !== 0,
  );
  if (usable.length === 0) return [];

  usable.sort((a, b) => {
    if (b.amp !== a.amp) return b.amp - a.amp;
    return Math.abs(a.freq) - Math.abs(b.freq);
  });

  const count = Number.isFinite(limit)
    ? Math.max(0, Math.min(usable.length, Math.floor(limit)))
    : usable.length;
  const kept = usable.slice(0, count);
  if (kept.length === 0) return [];

  const max = kept[0].amp;
  return kept.map((t) => ({
    freq: t.freq,
    amp: t.amp,
    rel: max > 0 ? t.amp / max : 0,
  }));
}

/**
 * Signed frequency of the highest-amplitude non-DC term, in cycles per loop.
 * Returns 0 when there is no usable term.
 *
 * @param {Array<{freq:number, amp:number}>} terms
 * @returns {number}
 */
export function dominantFrequency(terms) {
  const [first] = spectrumBars(terms, 1);
  return first ? first.freq : 0;
}
