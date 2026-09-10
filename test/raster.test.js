import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterPlan } from '../src/raster.js';

const square = [
  { x: -10, y: -5 },
  { x: 10, y: -5 },
  { x: 10, y: 15 },
  { x: -10, y: 15 },
];

test('the plan fits the curve to its bounds plus a uniform margin', () => {
  const plan = rasterPlan(square, { padding: 10, pixelRatio: 1, minSize: 1 });
  // content box: 20 + 2*10 wide, 20 + 2*10 tall
  assert.equal(plan.width, 40);
  assert.equal(plan.height, 40);
  assert.equal(plan.scale, 1);
  // first vertex sits one padding in from the top-left of the bitmap
  assert.deepEqual(plan.polyline[0], { x: 10, y: 10 });
  assert.deepEqual(plan.polyline[2], { x: 30, y: 30 });
});

test('pixelRatio scales the output size and the mapped coordinates', () => {
  const plan = rasterPlan(square, { padding: 0, pixelRatio: 3, minSize: 1 });
  assert.equal(plan.width, 60);
  assert.equal(plan.height, 60);
  assert.equal(plan.scale, 3);
  assert.deepEqual(plan.polyline[1], { x: 60, y: 0 });
});

test('maxSize caps the longest edge while holding the aspect ratio', () => {
  const wide = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 100 },
    { x: 0, y: 100 },
  ];
  const plan = rasterPlan(wide, { padding: 0, pixelRatio: 10, maxSize: 800, minSize: 1 });
  assert.equal(plan.width, 800);
  assert.equal(plan.height, 200);
});

test('minSize floors the longest edge for a tiny curve', () => {
  const plan = rasterPlan(square, { padding: 0, pixelRatio: 0.01, minSize: 100 });
  // longest content edge is 20; floored up to 100
  assert.equal(Math.max(plan.width, plan.height), 100);
});

test('a background color is passed through, null by default', () => {
  assert.equal(rasterPlan(square).background, null);
  assert.equal(rasterPlan(square, { background: '#0b0b0b' }).background, '#0b0b0b');
});

test('stroke style is carried on the plan', () => {
  const plan = rasterPlan(square, { stroke: '#ff0066', strokeWidth: 4 });
  assert.equal(plan.stroke, '#ff0066');
  assert.equal(plan.strokeWidth, 4);
});

test('closed is only honoured with three or more points', () => {
  assert.equal(rasterPlan(square, { closed: true }).closed, true);
  assert.equal(rasterPlan(square, { closed: false }).closed, false);
  const twoPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  assert.equal(rasterPlan(twoPoints, { closed: true }).closed, false);
});

test('non-finite points are dropped before bounds are measured', () => {
  const plan = rasterPlan(
    [
      { x: 0, y: 0 },
      { x: Infinity, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
    ],
    { padding: 0, pixelRatio: 1, minSize: 1 },
  );
  assert.equal(plan.width, 10);
  assert.equal(plan.height, 10);
  assert.equal(plan.polyline.length, 3);
});

test('a degenerate curve still yields a valid non-zero bitmap', () => {
  const horizontal = [
    { x: 0, y: 5 },
    { x: 40, y: 5 },
  ];
  const plan = rasterPlan(horizontal, { padding: 2, pixelRatio: 1, minSize: 1 });
  // height extent floors at 1, so the content box is 44 x 5
  assert.equal(plan.width, 44);
  assert.equal(plan.height, 5);
});

test('an empty or missing curve produces a 1x1-fit plan with no points', () => {
  for (const input of [[], null, [{ x: NaN, y: 0 }]]) {
    const plan = rasterPlan(input, { padding: 0, pixelRatio: 1, minSize: 1 });
    assert.equal(plan.polyline.length, 0);
    assert.ok(plan.width >= 1 && plan.height >= 1);
  }
});

test('mapped coordinates are rounded to the configured precision', () => {
  const plan = rasterPlan([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }], {
    padding: 0,
    pixelRatio: 1,
    minSize: 1,
    precision: 2,
  });
  // scale is minSize-free here: content box 3x3, longest 3 -> width 3, scale 1
  for (const p of plan.polyline) {
    assert.equal(Math.round(p.x * 100) / 100, p.x);
  }
});

test('invalid options fall back to sane defaults instead of throwing', () => {
  const plan = rasterPlan(square, {
    padding: -5,
    pixelRatio: 0,
    maxSize: NaN,
    strokeWidth: -1,
  });
  assert.ok(Number.isInteger(plan.width) && plan.width > 0);
  assert.ok(Number.isInteger(plan.height) && plan.height > 0);
  assert.equal(plan.strokeWidth, 2);
});
