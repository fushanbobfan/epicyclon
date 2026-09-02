import test from 'node:test';
import assert from 'node:assert/strict';
import {
  termVector,
  chainPoints,
  penPosition,
  tracePath,
} from '../src/epicycles.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);
const approxPt = (p, x, y, eps = 1e-9) => {
  approx(p.x, x, eps);
  approx(p.y, y, eps);
};

test('termVector points along +x at t=0 with zero phase', () => {
  approxPt(termVector({ freq: 1, amp: 3, phase: 0 }, 0), 3, 0);
});

test('termVector completes a full turn over t in [0,1)', () => {
  const term = { freq: 1, amp: 1, phase: 0 };
  approxPt(termVector(term, 0.25), 0, 1);
  approxPt(termVector(term, 0.5), -1, 0);
  approxPt(termVector(term, 0.75), 0, -1);
});

test('negative frequency rotates the other way', () => {
  approxPt(termVector({ freq: -1, amp: 1, phase: 0 }, 0.25), 0, -1);
});

test('phase offsets the starting angle', () => {
  approxPt(termVector({ freq: 1, amp: 2, phase: Math.PI / 2 }, 0), 0, 2);
});

test('chainPoints returns one more point than there are terms', () => {
  const terms = [
    { freq: 0, amp: 1, phase: 0 },
    { freq: 1, amp: 2, phase: 0 },
    { freq: -1, amp: 3, phase: 0 },
  ];
  const pts = chainPoints(terms, 0);
  assert.equal(pts.length, terms.length + 1);
});

test('chainPoints accumulates vectors tip to tail', () => {
  const terms = [
    { freq: 0, amp: 5, phase: 0 },
    { freq: 1, amp: 2, phase: Math.PI / 2 },
  ];
  const pts = chainPoints(terms, 0, { x: 10, y: 1 });
  approxPt(pts[0], 10, 1);
  approxPt(pts[1], 15, 1);
  approxPt(pts[2], 15, 3);
});

test('penPosition equals the last chain point', () => {
  const terms = [
    { freq: 0, amp: 1, phase: 0.3 },
    { freq: 2, amp: 4, phase: -1 },
    { freq: -3, amp: 2, phase: 2 },
  ];
  for (const t of [0, 0.1, 0.37, 0.8]) {
    const chain = chainPoints(terms, t, { x: -2, y: 5 });
    const pen = penPosition(terms, t, { x: -2, y: 5 });
    approxPt(pen, chain[chain.length - 1].x, chain[chain.length - 1].y, 1e-12);
  }
});

test('a closed curve returns to its start after one loop', () => {
  const terms = [
    { freq: 1, amp: 7, phase: 0.2 },
    { freq: -2, amp: 3, phase: 1.1 },
  ];
  approxPt(penPosition(terms, 0), penPosition(terms, 1).x, penPosition(terms, 1).y, 1e-9);
});

test('tracePath produces the requested number of samples', () => {
  const terms = [{ freq: 1, amp: 1, phase: 0 }];
  assert.equal(tracePath(terms, 32).length, 32);
  assert.equal(tracePath(terms, 0).length, 0);
});

test('tracePath of a single rotation lands on a circle of radius amp', () => {
  const terms = [{ freq: 1, amp: 6, phase: 0 }];
  for (const p of tracePath(terms, 40)) {
    approx(Math.hypot(p.x, p.y), 6, 1e-9);
  }
});

test('empty term list stays at the origin', () => {
  approxPt(penPosition([], 0.5), 0, 0);
  approxPt(penPosition([], 0.5, { x: 4, y: -1 }), 4, -1);
});
