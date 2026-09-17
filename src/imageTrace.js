// Turn a raster image into a traceable outline — the bitmap counterpart to
// svgImport.js. The pixels are thresholded into a foreground mask, the
// largest connected blob is kept, its boundary is walked pixel by pixel, and
// the resulting polyline is simplified so the DFT works from the silhouette's
// real corners and curves rather than from a staircase of pixel edges.
//
// Everything here is pure: it takes an ImageData-shaped object
// ({ width, height, data }) and returns plain points, so the tests can build
// tiny bitmaps by hand without a canvas.

/** Rec. 601 luma of an RGB triple, in [0, 255]. */
export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Threshold an image into a foreground mask (1 = part of the shape).
 *
 * If any pixel is transparent, the alpha channel decides — a logo on a
 * transparent background traces as the logo regardless of its colour.
 * Otherwise dark pixels are foreground, unless `invert` is set (or, when it
 * is left undefined, the image border is mostly dark, which means a light
 * shape on a dark background).
 *
 * @param {{width:number, height:number, data:ArrayLike<number>}} image
 * @param {{threshold?:number, invert?:boolean}} [opts]
 * @returns {{width:number, height:number, mask:Uint8Array, mode:'alpha'|'dark'|'light'}}
 */
export function toMask(image, opts = {}) {
  const { width, height, data } = image;
  const threshold = opts.threshold ?? 128;
  const count = width * height;
  const mask = new Uint8Array(count);

  let hasTransparency = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasTransparency = true;
      break;
    }
  }

  if (hasTransparency) {
    for (let i = 0; i < count; i++) mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0;
    return { width, height, mask, mode: 'alpha' };
  }

  let invert = opts.invert;
  if (invert === undefined) invert = borderIsDark(image, threshold);

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const dark = luminance(data[o], data[o + 1], data[o + 2]) < threshold;
    mask[i] = dark !== invert ? 1 : 0;
  }
  return { width, height, mask, mode: invert ? 'light' : 'dark' };
}

function borderIsDark(image, threshold) {
  const { width, height, data } = image;
  let dark = 0;
  let total = 0;
  const visit = (x, y) => {
    const o = (y * width + x) * 4;
    if (luminance(data[o], data[o + 1], data[o + 2]) < threshold) dark++;
    total++;
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    if (height > 1) visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    if (width > 1) visit(width - 1, y);
  }
  return total > 0 && dark / total > 0.5;
}

/**
 * Keep only the largest 4-connected blob of foreground pixels, so stray
 * specks and a second small shape don't disturb the outline.
 *
 * @param {{width:number, height:number, mask:Uint8Array}} layer
 * @returns {{width:number, height:number, mask:Uint8Array, size:number}}
 */
export function largestComponent(layer) {
  const { width, height, mask } = layer;
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop();
      size++;
      const x = i % width;
      const y = (i - x) / width;
      const tryPush = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const j = ny * width + nx;
        if (mask[j] === 1 && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      };
      tryPush(x - 1, y);
      tryPush(x + 1, y);
      tryPush(x, y - 1);
      tryPush(x, y + 1);
    }
    sizes.push(size);
  }

  const out = new Uint8Array(width * height);
  if (sizes.length === 0) return { width, height, mask: out, size: 0 };
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
  return { width, height, mask: out, size: sizes[best] };
}

// The eight neighbours in clockwise order starting from west, which is what
// Moore-neighbour tracing walks around.
const DIRS = [
  [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
];

function dirIndex(dx, dy) {
  for (let i = 0; i < DIRS.length; i++) if (DIRS[i][0] === dx && DIRS[i][1] === dy) return i;
  return -1;
}

/**
 * Walk the outer boundary of the foreground with Moore-neighbour tracing,
 * returning the boundary pixel centres in order. Works on any mask but is
 * meant to follow `largestComponent`, since it only ever traces the blob
 * that owns the topmost-leftmost foreground pixel.
 *
 * @param {{width:number, height:number, mask:Uint8Array}} layer
 * @returns {Array<{x:number, y:number}>}
 */
export function traceBoundary(layer) {
  const { width, height, mask } = layer;
  const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0);

  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const sx = start % width;
  const sy = (start - sx) / width;
  const points = [{ x: sx, y: sy }];

  let cx = sx;
  let cy = sy;
  let backtrack = 0; // west: the raster scan guarantees that pixel is empty
  let firstMove = null;
  const limit = mask.length * 4 + 8;

  for (let iter = 0; iter < limit; iter++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (backtrack + k) % 8;
      if (at(cx + DIRS[d][0], cy + DIRS[d][1]) === 1) {
        found = d;
        break;
      }
    }
    if (found === -1) return points; // an isolated pixel

    const prevDir = (found + 7) % 8;
    const nx = cx + DIRS[found][0];
    const ny = cy + DIRS[found][1];
    // The last empty pixel checked, expressed as a direction from the new position.
    const bx = cx + DIRS[prevDir][0] - nx;
    const by = cy + DIRS[prevDir][1] - ny;

    const move = `${cx},${cy}>${nx},${ny}`;
    if (firstMove === null) firstMove = move;
    else if (move === firstMove) break; // back at the start, leaving the same way

    cx = nx;
    cy = ny;
    backtrack = dirIndex(bx, by);
    points.push({ x: cx, y: cy });
  }

  // The loop closes on the start pixel; drop the duplicate.
  if (points.length > 1) {
    const last = points[points.length - 1];
    if (last.x === sx && last.y === sy) points.pop();
  }
  return points;
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/**
 * Ramer–Douglas–Peucker: drop points that lie within `tolerance` of the
 * line between their surviving neighbours. Endpoints are always kept.
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {number} tolerance
 * @returns {Array<{x:number, y:number}>}
 */
export function simplify(points, tolerance) {
  if (!Array.isArray(points) || points.length < 3 || !(tolerance > 0)) return points ? points.slice() : [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Simplify a closed outline. Plain Douglas–Peucker always keeps its two
 * endpoints, which for a loop are an arbitrary pixel and its neighbour; this
 * splits the loop at the point farthest from the start so both halves are
 * simplified against a meaningful chord.
 *
 * @param {Array<{x:number, y:number}>} points
 * @param {number} tolerance
 * @returns {Array<{x:number, y:number}>}
 */
export function simplifyClosed(points, tolerance) {
  if (!Array.isArray(points) || points.length < 4 || !(tolerance > 0)) return points ? points.slice() : [];
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const a = simplify(points.slice(0, far + 1), tolerance);
  const b = simplify(points.slice(far).concat([points[0]]), tolerance);
  // `a` ends and `b` starts on points[far]; `b` ends on points[0], which `a` starts with.
  return a.concat(b.slice(1, -1));
}

/**
 * The whole pipeline: image → mask → largest blob → boundary → simplified
 * outline in pixel coordinates. Returns an empty array when nothing usable
 * was found.
 *
 * @param {{width:number, height:number, data:ArrayLike<number>}} image
 * @param {{threshold?:number, invert?:boolean, tolerance?:number}} [opts]
 * @returns {Array<{x:number, y:number}>}
 */
export function traceImage(image, opts = {}) {
  if (!image || !(image.width > 0) || !(image.height > 0) || !image.data) return [];
  const blob = largestComponent(toMask(image, opts));
  if (blob.size < 3) return [];
  const outline = traceBoundary(blob);
  const tolerance = opts.tolerance ?? 1;
  const simplified = simplifyClosed(outline, tolerance);
  return simplified.length >= 3 ? simplified : [];
}
