// Render the epicycle chain as a stereo audio signal instead of a drawn curve: the left channel
// is x(t), the right channel is y(t), each scaled to fit [-1, 1]. Playing the result through an
// oscilloscope in X-Y mode (or "oscilloscope music" software that emulates one) retraces the
// curve on the scope's own screen — the classic vector-display trick, here driven by the same
// DFT reconstruction the rest of this project draws with a pen.
//
// Sample generation and WAV encoding are both plain, DOM-free functions, exactly like svg.js's
// document building and raster.js's export planning; turning the resulting bytes into a
// downloadable file is left to app.js, the same way those two hand their output to a Blob.

import { penPosition, tracePath } from './epicycles.js';

const SAMPLE_DEFAULTS = {
  sampleRate: 44100,
  durationSeconds: 4,
  loopsPerSecond: 1,
  /** fraction of the fitted range left as headroom, so the signal doesn't ride exactly at +-1 */
  padding: 0.05,
};

/** Axis-aligned bounds of a point list. `w`/`h` are floored at 1 (as svg.js's and raster.js's
 * own copies of this helper do, each kept self-contained rather than shared) so a degenerate
 * shape never divides by zero; `minX`/`maxX`/`minY`/`maxY` stay the real, unfloored values so
 * the true midpoint can still be computed even when one axis is almost flat. */
function boundsOf(pts) {
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 1, h: 1 };
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
    maxX,
    maxY,
    w: Math.max(maxX - minX, 1),
    h: Math.max(maxY - minY, 1),
  };
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Samples the epicycle chain's pen position as a stereo signal: x(t) on the left channel, y(t)
 * on the right, both shifted to the curve's own center and scaled *uniformly* (not stretched
 * per axis) so the shape's aspect ratio survives on an oscilloscope screen the same way it does
 * on the canvas. The scale is measured once from a dense one-loop trace — the curve is periodic,
 * so its bounds don't change loop to loop — then reused for every audio-rate sample.
 *
 * @param {Array<{freq:number, amp:number, phase:number}>} terms
 * @param {Partial<typeof SAMPLE_DEFAULTS>} [opts]
 * @returns {{ left: Float32Array, right: Float32Array, sampleRate: number }}
 */
export function stereoSamples(terms, opts = {}) {
  const cfg = { ...SAMPLE_DEFAULTS, ...opts };
  const sampleRate = Math.round(finitePositive(cfg.sampleRate, SAMPLE_DEFAULTS.sampleRate));
  const duration = finitePositive(cfg.durationSeconds, SAMPLE_DEFAULTS.durationSeconds);
  const loopsPerSecond = finitePositive(cfg.loopsPerSecond, SAMPLE_DEFAULTS.loopsPerSecond);
  const padding =
    Number.isFinite(cfg.padding) && cfg.padding >= 0 && cfg.padding < 1
      ? cfg.padding
      : SAMPLE_DEFAULTS.padding;

  const totalSamples = Math.max(0, Math.round(sampleRate * duration));
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  if (!Array.isArray(terms) || terms.length === 0 || totalSamples === 0) {
    return { left, right, sampleRate };
  }

  const probe = tracePath(terms, 2000);
  const bounds = boundsOf(probe);
  // The true midpoint of the real (unfloored) extent, not `minX + w/2` — using the floored `w`
  // here would shift the center by half the floor's padding whenever the real range is smaller
  // than it, which is exactly the near-flat case (a straight or nearly straight traced line)
  // this floor exists to handle.
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfExtent = Math.max(bounds.w, bounds.h) / 2;
  const scale = halfExtent > 0 ? (1 - padding) / halfExtent : 1;

  for (let i = 0; i < totalSamples; i++) {
    const t = ((i / sampleRate) * loopsPerSecond) % 1;
    const p = penPosition(terms, t);
    left[i] = clamp((p.x - centerX) * scale, -1, 1);
    right[i] = clamp((p.y - centerY) * scale, -1, 1);
  }
  return { left, right, sampleRate };
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function floatToPcm16(sample) {
  const clamped = clamp(sample, -1, 1);
  // Slightly asymmetric range (32767 vs -32768) is the standard 16-bit PCM convention; rounding
  // toward it rather than truncating keeps a clean +-1 input from landing one code short.
  return Math.round(clamped * 32767);
}

/**
 * Encodes two equal-length channels of samples in [-1, 1] as a standalone, uncompressed
 * 16-bit PCM stereo WAV file (the standard 44-byte header followed by interleaved samples).
 *
 * @param {{ left: Float32Array|number[], right: Float32Array|number[], sampleRate: number }} signal
 * @returns {Uint8Array} the complete file's bytes
 */
export function encodeWav({ left, right, sampleRate }) {
  const numSamples = Math.min(left.length, right.length);
  const channels = 2;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size for PCM
  view.setUint16(20, 1, true); // format 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, floatToPcm16(left[i]), true);
    view.setInt16(offset + 2, floatToPcm16(right[i]), true);
    offset += blockAlign;
  }

  return new Uint8Array(buffer);
}
