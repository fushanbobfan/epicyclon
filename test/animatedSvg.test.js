import test from 'node:test';
import assert from 'node:assert/strict';
import { curveToAnimatedSvg } from '../src/animatedSvg.js';

const square = [
  { x: -10, y: -5 },
  { x: 10, y: -5 },
  { x: 10, y: 15 },
  { x: -10, y: 15 },
];

test('curveToAnimatedSvg wraps a guide path and an animated dot in a complete document', () => {
  const svg = curveToAnimatedSvg(square);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.ok(svg.includes('<title>epicyclon animated curve</title>'));
  assert.ok(svg.includes('<path d="M '));
  assert.ok(svg.includes('fill="none"'));
  assert.ok(svg.includes('<circle'));
  assert.ok(svg.includes('<animateMotion'));
});

test('the guide path is faint so the moving dot reads as the focal point', () => {
  const svg = curveToAnimatedSvg(square);
  assert.ok(svg.includes('stroke-opacity="0.25"'));
});

test("the dot's animateMotion path is identical to the guide path's d attribute", () => {
  const svg = curveToAnimatedSvg(square, { padding: 0 });
  const guideD = svg.match(/<path d="([^"]+)"/)[1];
  const motionPath = svg.match(/<animateMotion[^>]*\bpath="([^"]+)"/)[1];
  assert.equal(motionPath, guideD);
  // Same reason a closed guide path loops cleanly on screen: identical start/end data means
  // the dot returns exactly to its starting point when animateMotion repeats, with no jump.
  assert.ok(guideD.endsWith(' Z'));
});

test('the viewBox and framing match curveToSvg exactly (same bounds/padding math)', () => {
  const svg = curveToAnimatedSvg(square, { padding: 8 });
  assert.match(svg, /viewBox="0 0 36 36"/);
  assert.match(svg, /width="36" height="36"/);
  assert.ok(svg.includes('d="M 8 8 L 28 8 L 28 28 L 8 28 Z"'));
});

test('durationSeconds sets the animateMotion dur attribute', () => {
  const fast = curveToAnimatedSvg(square, { durationSeconds: 2 });
  const slow = curveToAnimatedSvg(square, { durationSeconds: 10 });
  assert.ok(fast.includes('dur="2s"'));
  assert.ok(slow.includes('dur="10s"'));
});

test('an invalid durationSeconds falls back to the default rather than emitting a bad dur', () => {
  for (const bad of [0, -5, NaN, undefined]) {
    const svg = curveToAnimatedSvg(square, { durationSeconds: bad });
    assert.ok(svg.includes('dur="6s"'), `expected the default duration for ${bad}`);
  }
});

test('the animation always repeats indefinitely', () => {
  const svg = curveToAnimatedSvg(square);
  assert.ok(svg.includes('repeatCount="indefinite"'));
});

test('penRadius sets the dot circle radius, with an invalid value falling back to the default', () => {
  const custom = curveToAnimatedSvg(square, { penRadius: 12 });
  assert.ok(custom.includes('<circle r="12"'));
  for (const bad of [0, -3, NaN]) {
    const svg = curveToAnimatedSvg(square, { penRadius: bad });
    assert.ok(svg.includes('<circle r="5"'), `expected the default pen radius for ${bad}`);
  }
});

test('the dot fill follows the stroke color option', () => {
  const svg = curveToAnimatedSvg(square, { stroke: '#ff0066' });
  assert.ok(svg.includes('<path d="M ') && svg.includes('stroke="#ff0066"'));
  assert.ok(svg.includes('<circle r="5" fill="#ff0066">'));
});

test('special characters in title and colors are escaped', () => {
  const svg = curveToAnimatedSvg(square, {
    title: 'a & b <c>',
    stroke: '"quotes"',
  });
  assert.ok(svg.includes('<title>a &amp; b &lt;c&gt;</title>'));
  assert.ok(svg.includes('stroke="&quot;quotes&quot;"'));
});

test('a background option adds an opaque page rect, absent by default', () => {
  assert.ok(!curveToAnimatedSvg(square).includes('<rect'));
  const svg = curveToAnimatedSvg(square, { background: '#0b0b0b' });
  assert.ok(svg.includes('<rect width="36" height="36" fill="#0b0b0b"/>'));
});

test('fewer than two valid points produces a document with no path or animated dot', () => {
  for (const input of [[], [{ x: 1, y: 1 }], null, [{ x: NaN, y: 0 }]]) {
    const svg = curveToAnimatedSvg(input);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('</svg>'));
    assert.ok(!svg.includes('<path'));
    assert.ok(!svg.includes('<circle'));
    assert.ok(!svg.includes('<animateMotion'));
  }
});

test('non-finite points are dropped before bounds are measured', () => {
  const svg = curveToAnimatedSvg(
    [
      { x: 0, y: 0 },
      { x: Infinity, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
    ],
    { padding: 0 },
  );
  assert.match(svg, /viewBox="0 0 10 10"/);
  assert.ok(svg.includes('d="M 0 0 L 10 10 L 5 5 Z"'));
});
