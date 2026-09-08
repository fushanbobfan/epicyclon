import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState, SHARE_VERSION } from '../src/share.js';

test('preset round-trips exactly', () => {
  const encoded = encodeState({
    shape: 'star',
    termCount: 48,
    speed: 1.25,
    show: { circles: true, chain: false, input: true },
  });
  const decoded = decodeState(encoded);
  assert.equal(decoded.shape, 'star');
  assert.equal(decoded.path, null);
  assert.equal(decoded.termCount, 48);
  assert.equal(decoded.speed, 1.25);
  assert.deepEqual(decoded.show, { circles: true, chain: false, input: true });
});

test('encoded string starts with the version and is URL-hash safe', () => {
  const encoded = encodeState({ shape: 'heart' });
  assert.ok(encoded.startsWith(`${SHARE_VERSION}~`));
  assert.equal(encoded, encodeURI(encoded));
});

test('custom path round-trips within one unit and keeps its length', () => {
  const path = Array.from({ length: 40 }, (_, i) => ({
    x: 120 * Math.cos((i / 40) * 2 * Math.PI) + 0.37,
    y: 90 * Math.sin((i / 40) * 2 * Math.PI) - 0.62,
  }));
  const decoded = decodeState(encodeState({ path, termCount: 32, speed: 1 }));
  assert.equal(decoded.shape, null);
  assert.equal(decoded.path.length, path.length);
  for (let i = 0; i < path.length; i++) {
    assert.ok(Math.abs(decoded.path[i].x - path[i].x) <= 1);
    assert.ok(Math.abs(decoded.path[i].y - path[i].y) <= 1);
  }
});

test('a custom path wins over a null shape', () => {
  const path = [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 0, y: 12 },
  ];
  const encoded = encodeState({ shape: null, path });
  assert.ok(encoded.includes('~c:3,'));
  assert.equal(decodeState(encoded).path.length, 3);
});

test('a named shape wins over a stray path', () => {
  const encoded = encodeState({ shape: 'circle', path: [{ x: 1, y: 2 }] });
  const decoded = decodeState(encoded);
  assert.equal(decoded.shape, 'circle');
  assert.equal(decoded.path, null);
});

test('flags encode every on/off combination', () => {
  for (let bits = 0; bits < 8; bits++) {
    const show = {
      circles: (bits & 1) !== 0,
      chain: (bits & 2) !== 0,
      input: (bits & 4) !== 0,
    };
    const decoded = decodeState(encodeState({ shape: 'square', show }));
    assert.deepEqual(decoded.show, show);
  }
});

test('decode tolerates a leading hash', () => {
  const encoded = encodeState({ shape: 'lissajous' });
  assert.deepEqual(decodeState(`#${encoded}`), decodeState(encoded));
});

test('term count and speed are clamped into range on decode', () => {
  const hot = decodeState(`${SHARE_VERSION}~p:star~t999999~s9001~f7`);
  assert.ok(hot.termCount <= 4096);
  assert.ok(hot.speed <= 3);
  const cold = decodeState(`${SHARE_VERSION}~p:star~t0~s-40~f7`);
  assert.equal(cold.termCount, 1);
  assert.equal(cold.speed, 0);
});

test('malformed or unknown input decodes to null', () => {
  assert.equal(decodeState(''), null);
  assert.equal(decodeState('#'), null);
  assert.equal(decodeState('garbage'), null);
  assert.equal(decodeState('2~p:star~t8~s100~f1'), null, 'wrong version');
  assert.equal(decodeState(`${SHARE_VERSION}~p:star~t8~s100`), null, 'too few fields');
  assert.equal(decodeState(`${SHARE_VERSION}~x:star~t8~s100~f1`), null, 'unknown source tag');
  assert.equal(decodeState(`${SHARE_VERSION}~c:3,1,2,3,4~t8~s100~f1`), null, 'point count mismatch');
  assert.equal(decodeState(`${SHARE_VERSION}~c:2,1,x,3,4~t8~s100~f1`), null, 'non-numeric coord');
  assert.equal(decodeState(null), null);
});

test('empty state encodes to a decodable no-source permalink', () => {
  const decoded = decodeState(encodeState({}));
  assert.equal(decoded.shape, null);
  assert.equal(decoded.path, null);
  assert.equal(decoded.termCount, 64);
  assert.equal(decoded.speed, 1);
});
