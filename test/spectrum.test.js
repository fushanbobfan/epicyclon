import test from 'node:test';
import assert from 'node:assert/strict';
import { spectrumBars, dominantFrequency } from '../src/spectrum.js';

const term = (freq, amp) => ({ freq, amp, phase: 0 });

test('bars come back sorted by descending amplitude', () => {
  const bars = spectrumBars([term(1, 3), term(2, 10), term(3, 5)]);
  assert.deepEqual(
    bars.map((b) => b.freq),
    [2, 3, 1],
  );
});

test('rel is amplitude over the largest amplitude, first bar is 1', () => {
  const bars = spectrumBars([term(1, 8), term(2, 2), term(3, 4)]);
  assert.equal(bars[0].rel, 1);
  assert.equal(bars[1].rel, 0.5);
  assert.equal(bars[2].rel, 0.25);
});

test('the DC term is excluded', () => {
  const bars = spectrumBars([term(0, 100), term(1, 4), term(-1, 4)]);
  assert.equal(bars.length, 2);
  assert.ok(bars.every((b) => b.freq !== 0));
});

test('limit keeps only the tallest bars', () => {
  const bars = spectrumBars([term(1, 1), term(2, 9), term(3, 5), term(4, 7)], 2);
  assert.deepEqual(
    bars.map((b) => b.freq),
    [2, 4],
  );
});

test('zero and negative amplitudes are dropped', () => {
  const bars = spectrumBars([term(1, 0), term(2, -3), term(3, 6)]);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].freq, 3);
});

test('equal amplitudes break ties toward the lower absolute frequency', () => {
  const bars = spectrumBars([term(5, 2), term(-1, 2), term(3, 2)]);
  assert.deepEqual(
    bars.map((b) => b.freq),
    [-1, 3, 5],
  );
});

test('empty, non-array, and all-DC inputs yield no bars', () => {
  assert.deepEqual(spectrumBars([]), []);
  assert.deepEqual(spectrumBars(null), []);
  assert.deepEqual(spectrumBars([term(0, 5)]), []);
  assert.deepEqual(spectrumBars([term(1, 3)], 0), []);
});

test('dominantFrequency reports the tallest non-DC term', () => {
  assert.equal(dominantFrequency([term(0, 50), term(1, 2), term(-4, 9), term(2, 3)]), -4);
  assert.equal(dominantFrequency([]), 0);
  assert.equal(dominantFrequency([term(0, 10)]), 0);
});
