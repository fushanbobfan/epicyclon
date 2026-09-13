import test from 'node:test';
import assert from 'node:assert/strict';
import { stereoSamples, encodeWav } from '../src/wav.js';

const approx = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b} (within ${eps})`);

test('stereoSamples returns sampleRate * durationSeconds samples per channel', () => {
  const terms = [{ freq: 1, amp: 6, phase: 0 }];
  const { left, right, sampleRate } = stereoSamples(terms, {
    sampleRate: 8000,
    durationSeconds: 0.5,
  });
  assert.equal(sampleRate, 8000);
  assert.equal(left.length, 4000);
  assert.equal(right.length, 4000);
});

test('an empty term list produces the requested length of silence', () => {
  const { left, right, sampleRate } = stereoSamples([], { sampleRate: 22050, durationSeconds: 1 });
  assert.equal(left.length, 22050);
  assert.equal(right.length, 22050);
  assert.equal(sampleRate, 22050);
  assert.ok(left.every((v) => v === 0));
  assert.ok(right.every((v) => v === 0));
});

test('every sample stays within [-1, 1]', () => {
  const terms = [
    { freq: 1, amp: 6, phase: 0.4 },
    { freq: -3, amp: 2, phase: 1.1 },
    { freq: 5, amp: 0.5, phase: -2 },
  ];
  const { left, right } = stereoSamples(terms, { sampleRate: 4000, durationSeconds: 1 });
  for (let i = 0; i < left.length; i++) {
    assert.ok(left[i] >= -1 && left[i] <= 1, `left[${i}] = ${left[i]} out of range`);
    assert.ok(right[i] >= -1 && right[i] <= 1, `right[${i}] = ${right[i]} out of range`);
  }
});

test('a circle reaches the same fitted radius on both channels', () => {
  // freq 1 alone traces a perfect circle, so the uniform fit-to-[-1,1] scale should let both
  // channels reach the same peak magnitude, right up against the (1 - padding) headroom.
  const terms = [{ freq: 1, amp: 6, phase: 0 }];
  const { left, right } = stereoSamples(terms, {
    sampleRate: 720,
    durationSeconds: 1,
    padding: 0.05,
  });
  let maxLeft = 0;
  let maxRight = 0;
  for (let i = 0; i < left.length; i++) {
    maxLeft = Math.max(maxLeft, Math.abs(left[i]));
    maxRight = Math.max(maxRight, Math.abs(right[i]));
  }
  approx(maxLeft, 0.95, 0.01);
  approx(maxRight, 0.95, 0.01);
});

test('a purely horizontal curve leaves the right channel at zero and fits x uniformly', () => {
  // freq +1 and freq -1 at equal amplitude and phase cancel their y components entirely
  // (5 sin(2*pi*t) + 5 sin(-2*pi*t) = 0) and double the x components (10 cos(2*pi*t)), tracing
  // a flat horizontal line. Uniform (not per-axis) scaling means the near-zero height doesn't
  // get stretched back out to fill the range.
  const terms = [
    { freq: 1, amp: 5, phase: 0 },
    { freq: -1, amp: 5, phase: 0 },
  ];
  const { left, right } = stereoSamples(terms, {
    sampleRate: 720,
    durationSeconds: 1,
    padding: 0.05,
  });
  let maxAbsRight = 0;
  let minLeft = Infinity;
  let maxLeft = -Infinity;
  for (let i = 0; i < left.length; i++) {
    maxAbsRight = Math.max(maxAbsRight, Math.abs(right[i]));
    minLeft = Math.min(minLeft, left[i]);
    maxLeft = Math.max(maxLeft, left[i]);
  }
  approx(maxAbsRight, 0, 1e-6);
  approx(minLeft, -0.95, 0.01);
  approx(maxLeft, 0.95, 0.01);
});

test('the signal is periodic: one loop later lands back on the same sample', () => {
  const terms = [
    { freq: 1, amp: 6, phase: 0.4 },
    { freq: -2, amp: 3, phase: 1.1 },
  ];
  const { left, right } = stereoSamples(terms, {
    sampleRate: 1000,
    durationSeconds: 2,
    loopsPerSecond: 1,
  });
  approx(left[0], left[1000], 1e-6);
  approx(right[0], right[1000], 1e-6);
});

test('loopsPerSecond speeds up the phase advance proportionally', () => {
  const terms = [{ freq: 1, amp: 6, phase: 0 }];
  const slow = stereoSamples(terms, { sampleRate: 1000, durationSeconds: 1, loopsPerSecond: 1 });
  const fast = stereoSamples(terms, { sampleRate: 1000, durationSeconds: 1, loopsPerSecond: 2 });
  // At twice the loop rate, sample i of the fast signal matches sample 2i of one full second of
  // the slow signal's own phase progression — check a few positions directly instead of index
  // arithmetic across the wraparound.
  approx(fast.left[100], slow.left[200], 1e-6);
  approx(fast.right[100], slow.right[200], 1e-6);
});

test('encodeWav writes a standard 44-byte PCM header', () => {
  const left = new Float32Array([0, 0.5, -1, 1]);
  const right = new Float32Array([0, -0.5, 1, -1]);
  const bytes = encodeWav({ left, right, sampleRate: 44100 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, len) =>
    String.fromCharCode(...bytes.slice(offset, offset + len));

  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint32(16, true), 16); // PCM fmt chunk size
  assert.equal(view.getUint16(20, true), 1); // PCM format tag
  assert.equal(view.getUint16(22, true), 2); // stereo
  assert.equal(view.getUint32(24, true), 44100); // sample rate
  assert.equal(view.getUint16(32, true), 4); // block align: 2 channels * 2 bytes
  assert.equal(view.getUint16(34, true), 16); // bits per sample
  assert.equal(ascii(36, 4), 'data');

  const dataSize = left.length * 4;
  assert.equal(view.getUint32(40, true), dataSize);
  assert.equal(view.getUint32(4, true), 36 + dataSize);
  assert.equal(bytes.length, 44 + dataSize);
});

test('encodeWav round-trips known sample values through 16-bit PCM', () => {
  const left = new Float32Array([0, 0.5, -1, 1, -0.25]);
  const right = new Float32Array([1, -1, 0, 0.75, -0.75]);
  const bytes = encodeWav({ left, right, sampleRate: 8000 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < left.length; i++) {
    const offset = 44 + i * 4;
    const expectedLeft = Math.round(left[i] * 32767);
    const expectedRight = Math.round(right[i] * 32767);
    assert.equal(view.getInt16(offset, true), expectedLeft);
    assert.equal(view.getInt16(offset + 2, true), expectedRight);
  }
});

test('encodeWav uses the shorter channel length when they differ', () => {
  const left = new Float32Array([0, 0.5, 1]);
  const right = new Float32Array([0, -0.5]);
  const bytes = encodeWav({ left, right, sampleRate: 8000 });
  assert.equal(bytes.length, 44 + 2 * 4);
});
