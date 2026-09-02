import { dft, topTerms } from './dft.js';
import { chainPoints } from './epicycles.js';
import { resample } from './resample.js';
import { SHAPES } from './shapes.js';
import { drawScene, readColors } from './render.js';

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
  show: { circles: true, chain: true, input: false },
  colors: readColors(canvas),
  viewW: canvas.width,
  viewH: canvas.height,
};

const LOOP_SECONDS = 6;

function setPath(points) {
  state.path = points;
  state.terms = dft(points);
  refreshActiveTerms();
  state.t = 0;
  state.trace = [];
}

function refreshActiveTerms() {
  state.active = topTerms(state.terms, state.termCount);
}

function loadShape(name) {
  const def = SHAPES[name];
  if (!def) return;
  state.currentShape = name;
  const span = Math.min(state.viewW, state.viewH) * 0.62;
  const raw = def.generate(320, span);
  setPath(resample(raw, state.sampleCount, { closed: true }));
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
    { chain, trace: state.trace, input: state.path },
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

const playPause = document.getElementById('playPause');
playPause.addEventListener('click', () => {
  state.playing = !state.playing;
  playPause.textContent = state.playing ? 'Pause' : 'Play';
  playPause.setAttribute('aria-pressed', String(!state.playing));
});

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
loadShape(state.currentShape);
requestAnimationFrame(frame);

export { state, loadShape, tick };
