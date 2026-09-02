// Canvas drawing helpers for the epicycle scene. These take a 2D context and
// world-space points already centered on the canvas middle.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} scene
 * @param {Array<{x:number,y:number}>} scene.chain    epicycle centers + tip
 * @param {Array<{x:number,y:number}>} scene.trace    traced curve so far
 * @param {Array<{x:number,y:number}>} [scene.input]  original resampled path
 * @param {object} opts  { showCircles, showChain, showInput, colors }
 */
export function drawScene(ctx, scene, opts) {
  const width = opts.width ?? ctx.canvas.width;
  const height = opts.height ?? ctx.canvas.height;
  const { colors } = opts;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);

  if (opts.showInput && scene.input && scene.input.length > 1) {
    strokePath(ctx, scene.input, colors.inputPath, 1.5, true);
  }

  if (scene.chain && scene.chain.length > 1) {
    if (opts.showCircles) drawCircles(ctx, scene.chain, colors.circle);
    if (opts.showChain) drawRadii(ctx, scene.chain, colors.radius);
  }

  if (scene.trace && scene.trace.length > 1) {
    strokePath(ctx, scene.trace, colors.trace, 2.25, false);
  }

  const tip = scene.chain && scene.chain[scene.chain.length - 1];
  if (tip) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = colors.trace;
    ctx.fill();
  }

  ctx.restore();
}

function drawCircles(ctx, chain, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < chain.length - 1; i++) {
    const c = chain[i];
    const next = chain[i + 1];
    const r = Math.hypot(next.x - c.x, next.y - c.y);
    if (r < 0.75) continue;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRadii(ctx, chain, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chain[0].x, chain[0].y);
  for (let i = 1; i < chain.length; i++) {
    ctx.lineTo(chain[i].x, chain[i].y);
  }
  ctx.stroke();
}

function strokePath(ctx, pts, color, lineWidth, closed) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  ctx.stroke();
}

/**
 * Read the theme colors from CSS custom properties so the canvas matches
 * light / dark mode.
 * @param {Element} el
 */
export function readColors(el) {
  const s = getComputedStyle(el);
  const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return {
    trace: get('--trace', '#2f6fed'),
    circle: get('--circle', 'rgba(0,0,0,0.18)'),
    radius: get('--radius', 'rgba(0,0,0,0.45)'),
    inputPath: get('--input-path', '#e8663a'),
  };
}
