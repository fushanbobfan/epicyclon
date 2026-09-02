import test from 'node:test';
import assert from 'node:assert/strict';
import { dft, foldFrequency, frequencyRank, topTerms } from '../src/dft.js';
import { penPosition } from '../src/epicycles.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

test('empty input yields no terms', () => {
  assert.deepEqual(dft([]), []);
});

test('single point yields one zero-frequency term at that point', () => {
  const terms = dft([{ x: 3, y: -4 }]);
  assert.equal(terms.length, 1);
  assert.equal(terms[0].freq, 0);
  approx(terms[0].amp, 5);
  approx(terms[0].re, 3);
  approx(terms[0].im, -4);
});

test('constant path collapses to a single DC term', () => {
  const pts = Array.from({ length: 8 }, () => ({ x: 2, y: 7 }));
  const terms = dft(pts);
  const dc = terms.find((t) => t.freq === 0);
  approx(dc.re, 2);
  approx(dc.im, 7);
  for (const t of terms) {
    if (t.freq !== 0) approx(t.amp, 0, 1e-9);
  }
});

test('reconstruction matches the original samples', () => {
  const N = 24;
  const pts = Array.from({ length: N }, (_, n) => {
    const a = (2 * Math.PI * n) / N;
    return {
      x: 40 * Math.cos(a) + 12 * Math.cos(5 * a + 1),
      y: 40 * Math.sin(a) - 9 * Math.sin(3 * a),
    };
  });
  const terms = dft(pts);
  for (let n = 0; n < N; n++) {
    const p = penPosition(terms, n / N);
    approx(p.x, pts[n].x, 1e-7);
    approx(p.y, pts[n].y, 1e-7);
  }
});

test('total energy is split across a pure rotation', () => {
  const N = 16;
  const r = 10;
  const pts = Array.from({ length: N }, (_, n) => {
    const a = (2 * Math.PI * n) / N;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  const terms = dft(pts);
  const one = terms.find((t) => t.freq === 1);
  approx(one.amp, r, 1e-9);
  for (const t of terms) {
    if (t.freq !== 1) approx(t.amp, 0, 1e-9);
  }
});

test('foldFrequency maps the upper half to negative frequencies', () => {
  assert.equal(foldFrequency(0, 8), 0);
  assert.equal(foldFrequency(1, 8), 1);
  assert.equal(foldFrequency(4, 8), 4);
  assert.equal(foldFrequency(5, 8), -3);
  assert.equal(foldFrequency(7, 8), -1);
});

test('frequencyRank interleaves positive and negative frequencies', () => {
  const ranks = [0, 1, -1, 2, -2, 3].map(frequencyRank);
  assert.deepEqual(ranks, [0, 1, 2, 3, 4, 5]);
});

test('dft terms come out in interleaved frequency order', () => {
  const pts = Array.from({ length: 6 }, (_, n) => ({ x: n, y: n * n }));
  const freqs = dft(pts).map((t) => t.freq);
  assert.deepEqual(freqs, [0, 1, -1, 2, -2, 3]);
});

test('topTerms keeps the largest amplitudes in original order', () => {
  const terms = [
    { freq: 0, amp: 5 },
    { freq: 1, amp: 1 },
    { freq: -1, amp: 9 },
    { freq: 2, amp: 3 },
  ];
  const kept = topTerms(terms, 2);
  assert.deepEqual(kept, [
    { freq: 0, amp: 5 },
    { freq: -1, amp: 9 },
  ]);
});

test('topTerms clamps out-of-range counts', () => {
  const terms = [
    { freq: 0, amp: 5 },
    { freq: 1, amp: 1 },
  ];
  assert.deepEqual(topTerms(terms, 0), []);
  assert.deepEqual(topTerms(terms, 99), terms);
});

test('topTerms breaks amplitude ties by lower absolute frequency', () => {
  const terms = [
    { freq: -3, amp: 4 },
    { freq: 1, amp: 4 },
    { freq: 0, amp: 1 },
  ];
  assert.deepEqual(topTerms(terms, 1), [{ freq: 1, amp: 4 }]);
});

test('dft rejects non-array input', () => {
  assert.throws(() => dft(null), TypeError);
});
