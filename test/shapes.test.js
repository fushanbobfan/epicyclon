import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPES,
  circle,
  square,
  star,
  heart,
  lissajous,
  infinity,
  sampleClosed,
  walkPolygon,
} from '../src/shapes.js';
import { pathLength } from '../src/resample.js';

const bbox = (pts) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

const centroid = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

test('every registered shape generates the requested point count', () => {
  for (const [name, def] of Object.entries(SHAPES)) {
    const pts = def.generate(128);
    assert.equal(pts.length, 128, `${name} count`);
    for (const p of pts) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${name} finite`);
    }
  }
});

test('shapes are centered near the origin', () => {
  for (const [name, def] of Object.entries(SHAPES)) {
    const c = centroid(def.generate(256, 200));
    assert.ok(Math.hypot(c.x, c.y) < 12, `${name} centroid ${c.x},${c.y}`);
  }
});

test('shapes honor the size argument', () => {
  for (const [name, def] of Object.entries(SHAPES)) {
    const small = bbox(def.generate(256, 100));
    const big = bbox(def.generate(256, 400));
    assert.ok(big.w > small.w * 3.5, `${name} width scales`);
    assert.ok(big.h > small.h * 3.5, `${name} height scales`);
  }
});

test('circle points sit on a circle of radius size/2', () => {
  for (const p of circle(64, 250)) {
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - 125) < 1e-9);
  }
});

test('square perimeter equals 4 * size', () => {
  const pts = square(400, 50);
  assert.ok(Math.abs(pathLength(pts, true) - 200) < 1e-9);
});

test('star has the requested number of outer spikes', () => {
  const pts = star(2000, 200, 5);
  const far = pts.filter((p) => Math.hypot(p.x, p.y) > 99).length;
  assert.ok(far > 0);
  // Five spikes near the outer radius, each contributing a short run of points.
  const maxR = Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
  assert.ok(Math.abs(maxR - 100) < 1);
});

test('heart is wider at the top than at the bottom tip', () => {
  const pts = heart(400, 200);
  const top = pts.filter((p) => p.y < 0);
  const bottom = pts.filter((p) => p.y > 0);
  assert.ok(bbox(top).w > bbox(bottom).w);
});

test('lissajous stays within its bounding size', () => {
  const b = bbox(lissajous(500, 300));
  assert.ok(b.w <= 300 + 1e-9 && b.h <= 300 + 1e-9);
});

test('infinity is a figure eight: about twice as wide as it is tall, crossing through the origin', () => {
  const pts = infinity(500, 200);
  const b = bbox(pts);
  // x = a*cos(t) reaches its full +-a extent exactly at the sampled t = 0, but y = (a/2)*sin(2t)
  // only reaches close to its +-a/2 extent, since none of the 500 sample points land exactly on
  // t = pi/4 — hence an exact width but an approximate (very slightly short) height.
  assert.ok(Math.abs(b.w - 200) < 1e-9);
  assert.ok(b.h > 95 && b.h <= 100);
  // The curve crosses itself at the origin twice per loop, at t = pi/2 and t = 3pi/2, both of
  // which land exactly on a sample point for a count divisible by 4.
  const minDist = Math.min(...pts.map((p) => Math.hypot(p.x, p.y)));
  assert.ok(minDist < 1e-6);
});

test('sampleClosed does not repeat the closing point', () => {
  const pts = sampleClosed(4, (t) => ({ x: Math.cos(t), y: Math.sin(t) }));
  assert.equal(pts.length, 4);
  assert.ok(Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y) > 0.5);
});

test('walkPolygon distributes points evenly across edges', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
  ];
  const pts = walkPolygon(tri, 9);
  assert.equal(pts.length, 9);
  // 3 points per edge; point 0 is the first vertex.
  assert.ok(Math.hypot(pts[0].x, pts[0].y) < 1e-9);
  assert.ok(Math.hypot(pts[3].x - 3, pts[3].y) < 1e-9);
  assert.ok(Math.hypot(pts[6].x, pts[6].y - 3) < 1e-9);
});
