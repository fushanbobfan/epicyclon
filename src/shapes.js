// Built-in example shapes.
//
// Each generator returns `count` points sampled once around a closed curve,
// centered on the origin and scaled to roughly fit a box of the given `size`
// (the longest half-extent is about size / 2). They feed straight into
// `resample` and then `dft`.

/** Plain circle. */
export function circle(count, size = 200) {
  const r = size / 2;
  return sampleClosed(count, (t) => ({
    x: r * Math.cos(t),
    y: r * Math.sin(t),
  }));
}

/** Axis-aligned square, walked corner to corner. */
export function square(count, size = 200) {
  const h = size / 2;
  const corners = [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
  ];
  return walkPolygon(corners, count);
}

/** Regular five-point star (pentagram outline). */
export function star(count, size = 200, points = 5) {
  const outer = size / 2;
  const inner = outer * 0.382;
  const verts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return walkPolygon(verts, count);
}

/** The classic parametric heart, flipped so it sits upright in screen space. */
export function heart(count, size = 200) {
  const s = size / 34;
  return sampleClosed(count, (t) => {
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    return { x: x * s, y: -y * s };
  });
}

/** A 3:2 Lissajous figure. */
export function lissajous(count, size = 200) {
  const a = size / 2;
  return sampleClosed(count, (t) => ({
    x: a * Math.sin(3 * t + Math.PI / 2),
    y: a * Math.sin(2 * t),
  }));
}

export const SHAPES = {
  circle: { label: 'Circle', generate: circle },
  square: { label: 'Square', generate: square },
  star: { label: 'Star', generate: star },
  heart: { label: 'Heart', generate: heart },
  lissajous: { label: 'Lissajous', generate: lissajous },
};

/** Sample a closed parametric curve at `count` evenly spaced parameter values. */
export function sampleClosed(count, fn) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(fn((2 * Math.PI * i) / count));
  }
  return out;
}

/**
 * Walk the perimeter of a polygon, returning `count` points spaced evenly in
 * parameter space (equal points per edge, not equal arc length).
 */
export function walkPolygon(verts, count) {
  const n = verts.length;
  const out = [];
  for (let i = 0; i < count; i++) {
    const u = (i / count) * n;
    const edge = Math.floor(u);
    const f = u - edge;
    const a = verts[edge % n];
    const b = verts[(edge + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}
