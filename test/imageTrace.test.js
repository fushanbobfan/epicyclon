import test from 'node:test';
import assert from 'node:assert/strict';
import {
  luminance,
  toMask,
  largestComponent,
  traceBoundary,
  simplify,
  simplifyClosed,
  traceImage,
} from '../src/imageTrace.js';

// Build an ImageData-shaped object from rows of characters: '#' is black,
// '.' is white, ' ' is fully transparent, 'g' is mid grey.
function bitmap(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const ch = rows[y][x];
      let v = 255;
      let a = 255;
      if (ch === '#') v = 0;
      else if (ch === 'g') v = 128;
      else if (ch === ' ') a = 0;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = a;
    }
  }
  return { width, height, data };
}

function maskRows(layer) {
  const out = [];
  for (let y = 0; y < layer.height; y++) {
    let row = '';
    for (let x = 0; x < layer.width; x++) row += layer.mask[y * layer.width + x] ? '#' : '.';
    out.push(row);
  }
  return out;
}

function filledDisc(size, radius) {
  const rows = [];
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) row += Math.hypot(x - c, y - c) <= radius ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

test('luminance weights green most heavily', () => {
  assert.equal(luminance(255, 255, 255), 255);
  assert.equal(luminance(0, 0, 0), 0);
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
  assert.ok(luminance(255, 0, 0) > luminance(0, 0, 255));
});

test('toMask treats dark pixels as foreground on a light background', () => {
  const layer = toMask(bitmap(['....', '.##.', '.##.', '....']));
  assert.equal(layer.mode, 'dark');
  assert.deepEqual(maskRows(layer), ['....', '.##.', '.##.', '....']);
});

test('toMask flips automatically when the border is dark', () => {
  const layer = toMask(bitmap(['####', '#..#', '#..#', '####']));
  assert.equal(layer.mode, 'light');
  assert.deepEqual(maskRows(layer), ['....', '.##.', '.##.', '....']);
});

test('toMask honours an explicit invert flag over the border heuristic', () => {
  const layer = toMask(bitmap(['....', '.##.', '....']), { invert: true });
  assert.equal(layer.mode, 'light');
  assert.deepEqual(maskRows(layer), ['####', '#..#', '####']);
});

test('toMask uses alpha whenever the image has any transparency', () => {
  // A white shape on transparent: by luminance nothing is dark, by alpha the shape wins.
  const layer = toMask(bitmap(['    ', ' .. ', ' .. ', '    ']));
  assert.equal(layer.mode, 'alpha');
  assert.deepEqual(maskRows(layer), ['....', '.##.', '.##.', '....']);
});

test('toMask threshold decides what counts as dark', () => {
  const image = bitmap(['g']);
  assert.deepEqual(maskRows(toMask(image, { threshold: 200, invert: false })), ['#']);
  assert.deepEqual(maskRows(toMask(image, { threshold: 100, invert: false })), ['.']);
});

test('largestComponent keeps only the biggest 4-connected blob', () => {
  const layer = toMask(bitmap([
    '#....#',
    '.....#',
    '..##.#',
    '..##..',
    '#.....',
  ]));
  const blob = largestComponent(layer);
  assert.equal(blob.size, 4);
  assert.deepEqual(maskRows(blob), [
    '......',
    '......',
    '..##..',
    '..##..',
    '......',
  ]);
});

test('largestComponent does not join blobs that only touch diagonally', () => {
  const blob = largestComponent(toMask(bitmap(['##.', '##.', '..#'])));
  assert.equal(blob.size, 4);
  assert.deepEqual(maskRows(blob), ['##.', '##.', '...']);
});

test('largestComponent of an empty mask is empty', () => {
  const blob = largestComponent(toMask(bitmap(['...', '...'])));
  assert.equal(blob.size, 0);
  assert.deepEqual(maskRows(blob), ['...', '...']);
});

test('traceBoundary walks a rectangle clockwise from its top-left pixel', () => {
  const outline = traceBoundary(toMask(bitmap([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....',
  ])));
  assert.deepEqual(outline, [
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    { x: 3, y: 2 }, { x: 3, y: 3 },
    { x: 2, y: 3 }, { x: 1, y: 3 },
    { x: 1, y: 2 },
  ]);
});

test('traceBoundary skips interior pixels and handles shapes touching the edge', () => {
  const outline = traceBoundary(toMask(bitmap([
    '####',
    '####',
    '####',
    '####',
  ]), { invert: false }));
  assert.equal(outline.length, 12);
  assert.ok(!outline.some((p) => p.x === 1 && p.y === 1));
  assert.ok(!outline.some((p) => p.x === 2 && p.y === 2));
});

test('traceBoundary follows a one-pixel-wide line out and back', () => {
  const outline = traceBoundary(toMask(bitmap(['.....', '.###.', '.....'])));
  assert.deepEqual(outline, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }]);
});

test('traceBoundary of a single pixel or an empty mask', () => {
  assert.deepEqual(traceBoundary(toMask(bitmap(['...', '.#.', '...']))), [{ x: 1, y: 1 }]);
  assert.deepEqual(traceBoundary(toMask(bitmap(['...']))), []);
});

test('traceBoundary of a disc stays on the rim and visits every rim pixel once', () => {
  const rows = filledDisc(21, 9);
  const layer = toMask(bitmap(rows));
  const outline = traceBoundary(layer);
  const seen = new Set(outline.map((p) => `${p.x},${p.y}`));
  assert.equal(seen.size, outline.length, 'no repeats');
  for (const p of outline) {
    assert.equal(rows[p.y][p.x], '#', 'every point is foreground');
    const interior = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => rows[p.y + dy]?.[p.x + dx] === '#');
    assert.ok(!interior, `(${p.x},${p.y}) is interior`);
  }
  assert.ok(outline.length > 40 && outline.length < 80);
});

test('simplify keeps endpoints and corners but drops collinear points', () => {
  const line = [{ x: 0, y: 0 }, { x: 1, y: 0.01 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }];
  assert.deepEqual(simplify(line, 0.5), [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }]);
});

test('simplify leaves short inputs and a zero tolerance untouched', () => {
  const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  assert.deepEqual(simplify(two, 1), two);
  const three = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
  assert.deepEqual(simplify(three, 0), three);
  assert.deepEqual(simplify(null, 1), []);
});

test('simplifyClosed reduces a traced square to its four corners', () => {
  const outline = traceBoundary(toMask(bitmap([
    '........',
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '........',
  ])));
  const corners = simplifyClosed(outline, 0.5);
  assert.deepEqual(new Set(corners.map((p) => `${p.x},${p.y}`)), new Set(['1,1', '6,1', '6,6', '1,6']));
  assert.equal(corners.length, 4);
});

test('traceImage runs the full pipeline and ignores a smaller second blob', () => {
  const rows = filledDisc(31, 12);
  rows[1] = '##' + rows[1].slice(2);
  rows[2] = '##' + rows[2].slice(2);
  const outline = traceImage(bitmap(rows), { tolerance: 0.8 });
  assert.ok(outline.length >= 8 && outline.length < 60, `got ${outline.length} points`);
  for (const p of outline) assert.ok(Math.hypot(p.x - 15, p.y - 15) > 10, 'points sit on the rim');
  assert.ok(!outline.some((p) => p.x < 3 && p.y < 3), 'the corner speck was dropped');
});

test('traceImage returns nothing for blank, tiny or malformed input', () => {
  assert.deepEqual(traceImage(bitmap(['....', '....'])), []);
  assert.deepEqual(traceImage(bitmap(['.#..', '....'])), []);
  assert.deepEqual(traceImage(null), []);
  assert.deepEqual(traceImage({ width: 0, height: 0, data: [] }), []);
});
