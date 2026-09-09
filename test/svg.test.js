import test from 'node:test';
import assert from 'node:assert/strict';
import { curveToSvg, pathData } from '../src/svg.js';

const square = [
  { x: -10, y: -5 },
  { x: 10, y: -5 },
  { x: 10, y: 15 },
  { x: -10, y: 15 },
];

test('pathData emits one move then a line per later point', () => {
  const d = pathData(
    [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 4, y: 1 },
    ],
    2,
    false,
  );
  assert.equal(d, 'M 0 0 L 2 3 L 4 1');
});

test('pathData closes with Z only when asked and there are 3+ points', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 2, y: 3 },
  ];
  assert.ok(pathData(tri, 2, true).endsWith(' Z'));
  assert.ok(!pathData(tri, 2, false).endsWith(' Z'));
  assert.ok(
    !pathData([{ x: 0, y: 0 }, { x: 1, y: 1 }], 2, true).endsWith(' Z'),
    'a two-point path has nothing to close',
  );
});

test('pathData rounds coordinates to the requested precision', () => {
  const d = pathData([{ x: 1.23456, y: -2.7 }, { x: 0, y: 0 }], 3, false);
  assert.equal(d, 'M 1.235 -2.7 L 0 0');
});

test('curveToSvg wraps the path in a complete document', () => {
  const svg = curveToSvg(square);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.ok(svg.includes('<title>epicyclon curve</title>'));
  assert.ok(svg.includes('<path d="M '));
  assert.ok(svg.includes('fill="none"'));
});

test('the viewBox spans the curve plus a margin on every side', () => {
  const svg = curveToSvg(square, { padding: 8, closed: true });
  // width 20 + 2*8, height 20 + 2*8
  assert.match(svg, /viewBox="0 0 36 36"/);
  assert.match(svg, /width="36" height="36"/);
  // first vertex sits one padding in from the top-left corner
  assert.ok(svg.includes('d="M 8 8 L 28 8 L 28 28 L 8 28 Z"'));
});

test('padding of zero places the curve flush against the viewBox', () => {
  const svg = curveToSvg(square, { padding: 0 });
  assert.match(svg, /viewBox="0 0 20 20"/);
  assert.ok(svg.includes('d="M 0 0 L 20 0 L 20 20 L 0 20 Z"'));
});

test('a background option adds an opaque page rect, absent by default', () => {
  assert.ok(!curveToSvg(square).includes('<rect'));
  const svg = curveToSvg(square, { background: '#0b0b0b' });
  assert.ok(svg.includes('<rect width="36" height="36" fill="#0b0b0b"/>'));
});

test('stroke color, width and title are configurable', () => {
  const svg = curveToSvg(square, {
    stroke: '#ff0066',
    strokeWidth: 3.5,
    title: 'my drawing',
  });
  assert.ok(svg.includes('stroke="#ff0066"'));
  assert.ok(svg.includes('stroke-width="3.5"'));
  assert.ok(svg.includes('<title>my drawing</title>'));
});

test('special characters in title and colors are escaped', () => {
  const svg = curveToSvg(square, {
    title: 'a & b <c>',
    stroke: '"quotes"',
  });
  assert.ok(svg.includes('<title>a &amp; b &lt;c&gt;</title>'));
  assert.ok(svg.includes('stroke="&quot;quotes&quot;"'));
});

test('a degenerate curve still yields a valid non-zero viewBox', () => {
  const horizontal = [
    { x: 0, y: 5 },
    { x: 40, y: 5 },
  ];
  const svg = curveToSvg(horizontal, { padding: 2 });
  // height extent floors at 1, so viewBox height is 1 + 2*2
  assert.match(svg, /viewBox="0 0 44 5"/);
});

test('fewer than two valid points produces a document with no path', () => {
  for (const input of [[], [{ x: 1, y: 1 }], null, [{ x: NaN, y: 0 }]]) {
    const svg = curveToSvg(input);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('</svg>'));
    assert.ok(!svg.includes('<path'));
  }
});

test('non-finite points are dropped before bounds are measured', () => {
  const svg = curveToSvg([
    { x: 0, y: 0 },
    { x: Infinity, y: 0 },
    { x: 10, y: 10 },
    { x: 5, y: 5 },
  ], { padding: 0 });
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.ok(svg.includes('d="M 0 0 L 10 10 L 5 5 Z"'));
});

test('precision is clamped into a sane range', () => {
  // after the bounds shift the far point lands at x = 1 - 1/3 = 0.6666...
  const many = curveToSvg([{ x: 1 / 3, y: 0 }, { x: 1, y: 1 }], {
    precision: 99,
    padding: 0,
  });
  // clamped to 6 decimals
  assert.ok(many.includes('0.666667'));
  assert.ok(!many.includes('0.6666667'));
});
