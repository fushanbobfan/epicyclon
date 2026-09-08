import { dft, topTerms } from './dft.js';
import { chainPoints, tracePath } from './epicycles.js';
import { resample } from './resample.js';
import { SHAPES } from './shapes.js';
import { drawScene, readColors } from './render.js';
import { attachDrawing } from './ui.js';
import { encodeState, decodeState } from './share.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const state = {
  /** resampled source path in canvas-centered coordinates */
  path: [],
  /** all DFT terms for the current path, amplitude order preserved by index */
  terms: [],
  /** terms actually drawn this frame */
  active: [],
  trace: [],
  t: 0,
  playing: true,
  speed: 1,
  termCount: 64,
  sampleCount: 512,
  currentShape: 'star',
  /** raw stroke being drawn right now, empty when idle */
  draft: [],
  show: { circles: true, chain: true, input: false },
  colors: readColors(canvas),
  viewW: canvas.width,
  viewH: canvas.height,
};

const LOOP_SECONDS = 6;

const reduceMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

function announce(message) {
  const status = document.getElementById('status');
  if (status) status.textContent = message;
}

function setPath(points) {
  state.path = points;
  state.terms = dft(points);
  state.t = 0;
  state.trace = [];
  refreshActiveTerms();
}

function refreshActiveTerms() {
  state.active = topTerms(state.terms, state.termCount);
  syncStaticTrace();
}

/**
 * When the viewer prefers reduced motion, show the finished curve as a still
 * image instead of animating a pen around it.
 */
function syncStaticTrace() {
  if (reduceMotion && reduceMotion.matches && state.active.length) {
    state.trace = tracePath(state.active, 720);
    state.t = 0;
  }
}

function loadShape(name) {
  const def = SHAPES[name];
  if (!def) return;
  state.currentShape = name;
  const span = Math.min(state.viewW, state.viewH) * 0.62;
  const raw = def.generate(320, span);
  setPath(resample(raw, state.sampleCount, { closed: true }));
}

/** Adopt a freehand stroke (raw centered points) as the traced path. */
function useStroke(rawPoints) {
  if (!rawPoints || rawPoints.length < 3) return;
  state.currentShape = null;
  setPath(resample(rawPoints, state.sampleCount, { closed: true }));
}

/** How many trace points make one full loop at the current speed. */
function traceBudget() {
  return Math.max(120, Math.round((LOOP_SECONDS * 60) / Math.max(state.speed, 0.05)));
}

function step(dtSeconds) {
  if (state.playing && state.active.length > 0) {
    state.t = (state.t + (dtSeconds / LOOP_SECONDS) * state.speed) % 1;
  }
}

function render() {
  const chain = state.active.length ? chainPoints(state.active, state.t) : [];
  const tip = chain[chain.length - 1];
  if (tip && state.playing) {
    state.trace.push({ x: tip.x, y: tip.y });
    const budget = traceBudget();
    while (state.trace.length > budget) state.trace.shift();
  }
  drawScene(
    ctx,
    { chain, trace: state.trace, input: state.path, draft: state.draft },
    {
      showCircles: state.show.circles,
      showChain: state.show.chain,
      showInput: state.show.input,
      colors: state.colors,
      width: state.viewW,
      height: state.viewH,
    },
  );
}

/** Advance the simulation by `dtSeconds` and repaint once. */
function tick(dtSeconds) {
  step(dtSeconds);
  render();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const changed = w !== state.viewW || h !== state.viewH;
  state.viewW = w;
  state.viewH = h;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.colors = readColors(canvas);
  return changed;
}

function initPresetMenu() {
  const select = document.getElementById('shape');
  for (const [name, def] of Object.entries(SHAPES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = def.label;
    select.appendChild(opt);
  }
  select.value = state.currentShape;
}

// --- wiring ---------------------------------------------------------------

const hint = document.getElementById('hint');
const shapeSelect = document.getElementById('shape');

const playPause = document.getElementById('playPause');

function setPlaying(next) {
  state.playing = next;
  playPause.textContent = next ? 'Pause' : 'Play';
  playPause.setAttribute('aria-pressed', String(!next));
  announce(next ? 'Playing' : 'Paused');
  if (!next) syncStaticTrace();
}

playPause.addEventListener('click', () => setPlaying(!state.playing));

canvas.addEventListener('keydown', (ev) => {
  if (ev.key === ' ' || ev.key === 'Enter') {
    ev.preventDefault();
    setPlaying(!state.playing);
  } else if (ev.key === 'r' || ev.key === 'R') {
    ev.preventDefault();
    clearBtn?.click();
  }
});

const $ = (id) => document.getElementById(id);

const termsInput = $('terms');
const termsOut = $('termsOut');
if (termsInput) {
  termsInput.max = String(state.sampleCount / 2);
  termsInput.value = String(state.termCount);
  termsOut.textContent = String(state.termCount);
  termsInput.addEventListener('input', () => {
    state.termCount = Number(termsInput.value);
    termsOut.textContent = termsInput.value;
    state.trace = [];
    refreshActiveTerms();
    announce(`${state.termCount} circles`);
  });
}

const speedInput = $('speed');
const speedOut = $('speedOut');
if (speedInput) {
  speedInput.value = String(state.speed);
  speedOut.textContent = `${state.speed.toFixed(2)}×`;
  speedInput.addEventListener('input', () => {
    state.speed = Number(speedInput.value);
    speedOut.textContent = `${state.speed.toFixed(2)}×`;
  });
}

const toggleMap = {
  showCircles: 'circles',
  showChain: 'chain',
  showInput: 'input',
};
for (const [id, key] of Object.entries(toggleMap)) {
  const box = $(id);
  if (!box) continue;
  box.checked = state.show[key];
  box.addEventListener('change', () => {
    state.show[key] = box.checked;
    render();
  });
}

/** Push the current control-bearing state into the DOM inputs and outputs. */
function syncControls() {
  if (termsInput) {
    termsInput.value = String(state.termCount);
    termsOut.textContent = String(state.termCount);
  }
  if (speedInput) {
    speedInput.value = String(state.speed);
    speedOut.textContent = `${state.speed.toFixed(2)}×`;
  }
  for (const [id, key] of Object.entries(toggleMap)) {
    const box = $(id);
    if (box) box.checked = state.show[key];
  }
  if (shapeSelect) shapeSelect.value = state.currentShape || '';
}

/**
 * If the URL hash carries a permalink, adopt it: restore the layer toggles,
 * term count and speed, then load either the named preset or the saved
 * stroke. Returns true when a permalink was applied.
 */
function restoreFromHash() {
  const decoded = decodeState(window.location.hash);
  if (!decoded) return false;

  state.termCount = decoded.termCount;
  state.speed = decoded.speed;
  state.show = { ...state.show, ...decoded.show };

  if (decoded.path && decoded.path.length >= 3) {
    state.currentShape = null;
    useStroke(decoded.path);
    if (hint) hint.textContent = 'Shared stroke loaded. Adjust the circle count to taste.';
  } else if (decoded.shape && SHAPES[decoded.shape]) {
    loadShape(decoded.shape);
    if (hint) hint.textContent = 'Or draw your own shape on the canvas.';
  } else {
    return false;
  }

  syncControls();
  return true;
}

const clearBtn = $('clear');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    state.path = [];
    state.terms = [];
    state.active = [];
    state.trace = [];
    state.draft = [];
    state.currentShape = null;
    if (shapeSelect) shapeSelect.value = '';
    if (hint) hint.textContent = 'Draw a shape here with your mouse or finger.';
    render();
  });
}

// Track the real rendered size instead of guessing at load time.
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => {
    if (fitCanvas() && state.currentShape && state.path.length) {
      loadShape(state.currentShape);
    }
  });
  ro.observe(canvas);
}

window.addEventListener('resize', () => {
  fitCanvas();
});

if (shapeSelect) {
  shapeSelect.addEventListener('change', () => {
    const name = shapeSelect.value;
    if (name && SHAPES[name]) {
      loadShape(name);
      if (hint) hint.textContent = 'Or draw your own shape on the canvas.';
      announce(`${SHAPES[name].label} loaded`);
    }
  });
}

attachDrawing(canvas, {
  getView: () => ({ w: state.viewW, h: state.viewH }),
  onBegin: () => {
    state.draft = [];
    state.trace = [];
    state.active = [];
  },
  onPoint: (pt) => {
    state.draft.push(pt);
    render();
  },
  onCommit: (points) => {
    state.draft = [];
    useStroke(points);
    if (shapeSelect) shapeSelect.value = '';
    if (hint) hint.textContent = 'Nice. Adjust the circle count to sharpen or smooth it.';
    announce(`Traced a stroke of ${points.length} points with ${state.active.length} circles`);
  },
});

if (window.matchMedia) {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      state.colors = readColors(canvas);
    });
}

// --- boot ---------------------------------------------------------------

fitCanvas();
initPresetMenu();
if (!restoreFromHash()) {
  loadShape(state.currentShape);
}

if (reduceMotion && reduceMotion.matches) {
  setPlaying(false);
}
if (reduceMotion) {
  reduceMotion.addEventListener('change', (e) => {
    if (e.matches) setPlaying(false);
  });
}

requestAnimationFrame(frame);

export { state, loadShape, tick };
