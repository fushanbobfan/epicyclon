import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPathDataStrings,
  parsePathData,
  svgToPoints,
  fitToSpan,
} from '../src/svgImport.js';

test('extractPathDataStrings pulls every d attribute in document order', () => {
  const svg = `<svg><path d="M0 0 L1 1"/><path d='M2 2 L3 3'/></svg>`;
  assert.deepEqual(extractPathDataStrings(svg), ['M0 0 L1 1', 'M2 2 L3 3']);
});

test('extractPathDataStrings finds nothing in a document with no path', () => {
  assert.deepEqual(extractPathDataStrings('<svg><rect/></svg>'), []);
  assert.deepEqual(extractPathDataStrings(''), []);
  assert.deepEqual(extractPathDataStrings(null), []);
});

test('parsePathData walks M/L/H/V/Z into one closed subpath', () => {
  const subpaths = parsePathData('M0 0 L10 0 V10 H0 Z');
  assert.equal(subpaths.length, 1);
  assert.deepEqual(subpaths[0], [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
  ]);
});

test('parsePathData handles relative commands against a moving cursor', () => {
  const subpaths = parsePathData('m10 10 l5 0 l0 5 z');
  assert.deepEqual(subpaths[0], [
    { x: 10, y: 10 },
    { x: 15, y: 10 },
    { x: 15, y: 15 },
    { x: 10, y: 10 },
  ]);
});

test('parsePathData treats implicit repeats after M as lineto', () => {
  // M with a second coordinate pair and no letter between them.
  const subpaths = parsePathData('M0 0 10 0 10 10');
  assert.deepEqual(subpaths[0], [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ]);
});

test('parsePathData flattens a cubic curve into a smooth polyline', () => {
  const subpaths = parsePathData('M0 0 C0 10 10 10 10 0');
  const pts = subpaths[0];
  assert.ok(pts.length > 10, 'a curve should produce many points');
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last.x - 10) < 1e-9 && Math.abs(last.y - 0) < 1e-9);
  // The curve should bow upward (away from the straight chord) at its midpoint.
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(mid.y > 5, 'midpoint should bulge toward the control points');
});

test('parsePathData flattens a quadratic curve', () => {
  const subpaths = parsePathData('M0 0 Q5 10 10 0');
  const pts = subpaths[0];
  assert.ok(pts.length > 5);
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last.x - 10) < 1e-9 && Math.abs(last.y - 0) < 1e-9);
});

test('parsePathData resolves S/T smooth curves by reflecting the prior control point', () => {
  const subpaths = parsePathData('M0 0 C0 10 10 10 10 0 S30 -10 30 0');
  const pts = subpaths[0];
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last.x - 30) < 1e-9 && Math.abs(last.y - 0) < 1e-9);
});

test('parsePathData flattens an arc into a curved polyline that bulges off the chord', () => {
  // A semicircle of radius 5 from (0,0) to (10,0). Hand-verified against the
  // SVG spec's endpoint-to-center formula: sweep=1 centers at (5,0) and
  // bulges to (5,-5) at its midpoint.
  const subpaths = parsePathData('M0 0 A5 5 0 0 1 10 0');
  const pts = subpaths[0];
  assert.ok(pts.length > 10, 'an arc should produce many points');
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last.x - 10) < 1e-9 && Math.abs(last.y - 0) < 1e-6);
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(Math.abs(mid.x - 5) < 0.5, `expected midpoint x near 5, got ${mid.x}`);
  assert.ok(Math.abs(mid.y - -5) < 0.5, `expected midpoint y near -5, got ${mid.y}`);
});

test('parsePathData flips the arc to the other side when the sweep flag flips', () => {
  const sweep1 = parsePathData('M0 0 A5 5 0 0 1 10 0')[0];
  const sweep0 = parsePathData('M0 0 A5 5 0 0 0 10 0')[0];
  const mid1 = sweep1[Math.floor(sweep1.length / 2)];
  const mid0 = sweep0[Math.floor(sweep0.length / 2)];
  assert.ok(mid1.y < 0, 'sweep=1 should bulge to negative y');
  assert.ok(mid0.y > 0, 'sweep=0 should bulge to positive y');
});

test('parsePathData takes the long way around when the large-arc flag is set', () => {
  // Radius 10 with a chord of only 10 leaves room for two different arcs
  // (small: most of the way around; large: the rest). The large arc's
  // midpoint should land much further from the chord than the small one's.
  const small = parsePathData('M0 0 A10 10 0 0 1 10 0')[0];
  const large = parsePathData('M0 0 A10 10 0 1 1 10 0')[0];
  const smallMid = small[Math.floor(small.length / 2)];
  const largeMid = large[Math.floor(large.length / 2)];
  assert.ok(Math.abs(largeMid.y) > Math.abs(smallMid.y) + 1, `expected the large arc to bulge further: small y=${smallMid.y}, large y=${largeMid.y}`);
});

test('parsePathData falls back to a straight line for a degenerate arc', () => {
  // Zero radius is explicitly a straight line per the SVG spec.
  const subpaths = parsePathData('M0 0 A0 0 0 0 1 10 0');
  assert.deepEqual(subpaths[0], [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
});

test('parsePathData scales up an arc radius that is too small to reach its endpoint', () => {
  // Radius 1 can't span a chord of length 10; the spec says to scale rx/ry
  // up uniformly until it just barely can, rather than fail.
  const subpaths = parsePathData('M0 0 A1 1 0 0 1 10 0');
  const pts = subpaths[0];
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last.x - 10) < 1e-6 && Math.abs(last.y - 0) < 1e-6);
});

test('parsePathData starts a new subpath on every M', () => {
  const subpaths = parsePathData('M0 0 L1 1 M5 5 L6 6');
  assert.equal(subpaths.length, 2);
  assert.deepEqual(subpaths[0], [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(subpaths[1], [{ x: 5, y: 5 }, { x: 6, y: 6 }]);
});

test('parsePathData returns what it could parse before malformed data, and nothing for garbage', () => {
  assert.deepEqual(parsePathData('M0 0 L1 1 L'), [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
  assert.deepEqual(parsePathData('not a path at all'), []);
  assert.deepEqual(parsePathData(''), []);
  assert.deepEqual(parsePathData(null), []);
});

test('parsePathData never hangs on adversarial input', () => {
  // A trailing bare Z followed by stray numbers has no more commands to
  // consume them; the parser must stop instead of spinning on `idx`.
  const start = Date.now();
  parsePathData('M0 0 L1 1 Z 5 5 5 5 5 5 5 5 5 5');
  assert.ok(Date.now() - start < 1000);
});

test('svgToPoints picks the subpath with the largest bounding box', () => {
  const svg = `<svg>
    <path d="M0 0 L1 0 L1 1 L0 1 Z"/>
    <path d="M0 0 L100 0 L100 100 L0 100 Z"/>
  </svg>`;
  const pts = svgToPoints(svg);
  assert.deepEqual(pts, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 0, y: 0 },
  ]);
});

test('svgToPoints returns an empty array when there is nothing usable', () => {
  assert.deepEqual(svgToPoints('<svg><rect width="10" height="10"/></svg>'), []);
});

test('fitToSpan centers on the bounding-box middle and scales the longest side to span', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
  ];
  const fitted = fitToSpan(square, 100);
  // Longest side (20) now maps to 100, so the shorter side (10) maps to 50.
  assert.deepEqual(fitted, [
    { x: -50, y: -25 },
    { x: 50, y: -25 },
    { x: 50, y: 25 },
    { x: -50, y: 25 },
  ]);
});

test('fitToSpan tolerates degenerate input', () => {
  assert.deepEqual(fitToSpan([], 100), []);
  assert.deepEqual(fitToSpan(null, 100), []);
  // Zero-size bounding box: scale falls back to 1 instead of dividing by zero.
  assert.deepEqual(fitToSpan([{ x: 5, y: 5 }], 100), [{ x: 0, y: 0 }]);
});
