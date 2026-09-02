import test from 'node:test';
import assert from 'node:assert/strict';
import { resample, pathLength } from '../src/resample.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

test('pathLength sums segment lengths', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 4 },
  ];
  approx(pathLength(pts), 7);
});

test('pathLength can close the loop', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  approx(pathLength(square, false), 6);
  approx(pathLength(square, true), 8);
});

test('resampling a straight line spaces points evenly', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  const out = resample(line, 5);
  assert.equal(out.length, 5);
  out.forEach((p, i) => {
    approx(p.x, i * 2.5);
    approx(p.y, 0);
  });
});

test('open resampling keeps the first and last endpoints', () => {
  const path = [
    { x: 1, y: 1 },
    { x: 4, y: 5 },
    { x: 9, y: 2 },
  ];
  const out = resample(path, 7);
  approx(out[0].x, 1);
  approx(out[0].y, 1);
  approx(out[out.length - 1].x, 9);
  approx(out[out.length - 1].y, 2);
});

test('closed resampling does not repeat the seam point', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const out = resample(square, 8, { closed: true });
  assert.equal(out.length, 8);
  // 8 samples over a perimeter of 16 => one every 2 units, corners included.
  approx(out[0].x, 0);
  approx(out[0].y, 0);
  approx(out[2].x, 4);
  approx(out[2].y, 0);
  approx(out[4].x, 4);
  approx(out[4].y, 4);
  const last = out[out.length - 1];
  assert.ok(Math.hypot(last.x - 0, last.y - 0) > 0.5, 'seam not duplicated');
});

test('resample is stable when asked for more points than the input has', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 0, y: 8 },
  ];
  const out = resample(tri, 64);
  assert.equal(out.length, 64);
  for (const p of out) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('resampled span approaches the source arc length as samples grow', () => {
  const wiggle = Array.from({ length: 20 }, (_, i) => ({
    x: i,
    y: Math.sin(i / 2) * 3,
  }));
  const src = pathLength(wiggle);
  const coarse = pathLength(resample(wiggle, 40));
  const fine = pathLength(resample(wiggle, 4000));
  // Chords cut corners, so a resample never exceeds the polyline length,
  // and a denser resample gets closer to it.
  assert.ok(coarse <= src + 1e-9);
  assert.ok(fine <= src + 1e-9);
  assert.ok(src - fine < src - coarse);
  assert.ok(src - fine < src * 1e-3);
});

test('degenerate all-same-point input returns copies', () => {
  const pts = [
    { x: 2, y: 2 },
    { x: 2, y: 2 },
  ];
  const out = resample(pts, 4);
  assert.equal(out.length, 4);
  for (const p of out) approx(Math.hypot(p.x - 2, p.y - 2), 0);
});

test('count of zero yields an empty array; empty input throws', () => {
  assert.deepEqual(resample([{ x: 0, y: 0 }], 0), []);
  assert.throws(() => resample([], 5));
});
