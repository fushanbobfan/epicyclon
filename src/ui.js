// Pointer-driven freehand drawing and the control-panel wiring. Kept apart
// from app.js so the animation core stays free of DOM event plumbing.

/**
 * Capture a freehand stroke on the canvas and report it in coordinates
 * centered on the canvas middle (matching the render transform).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} handlers
 * @param {() => {w:number, h:number}} handlers.getView  current logical size
 * @param {() => void} [handlers.onBegin]
 * @param {(pt:{x:number,y:number}) => void} [handlers.onPoint]
 * @param {(points:Array<{x:number,y:number}>) => void} handlers.onCommit
 */
export function attachDrawing(canvas, handlers) {
  const { getView, onBegin, onPoint, onCommit } = handlers;
  let drawing = false;
  let points = [];

  const toLocal = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const { w, h } = getView();
    const sx = w / rect.width;
    const sy = h / rect.height;
    return {
      x: (ev.clientX - rect.left) * sx - w / 2,
      y: (ev.clientY - rect.top) * sy - h / 2,
    };
  };

  const start = (ev) => {
    drawing = true;
    points = [toLocal(ev)];
    canvas.setPointerCapture?.(ev.pointerId);
    onBegin?.();
    onPoint?.(points[0]);
    ev.preventDefault();
  };

  const move = (ev) => {
    if (!drawing) return;
    const p = toLocal(ev);
    const prev = points[points.length - 1];
    // Skip sub-pixel jitter so the sample list stays lean.
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 1.5) {
      points.push(p);
      onPoint?.(p);
    }
    ev.preventDefault();
  };

  const end = (ev) => {
    if (!drawing) return;
    drawing = false;
    canvas.releasePointerCapture?.(ev.pointerId);
    if (points.length >= 3) onCommit(points.slice());
    points = [];
  };

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  return () => {
    canvas.removeEventListener('pointerdown', start);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointercancel', end);
    canvas.removeEventListener('pointerleave', end);
  };
}
