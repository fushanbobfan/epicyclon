# epicyclon

Draw a shape with your mouse or finger, and watch a chain of rotating circles
(epicycles) retrace it. The path is decomposed with a discrete Fourier
transform; each circle is one frequency component, spinning at a constant rate
with a fixed radius and starting angle.

It runs entirely in the browser with no build step and no dependencies. The
math core is plain ES modules and is covered by a Node test suite.

## Quick start

Open `index.html` in a browser, or serve the folder:

```bash
npm run serve
# then visit http://localhost:8080
```

The dev server is a ~40-line dependency-free static file server; any other
static server works too.

## Controls

| Control | Effect |
| --- | --- |
| Draw on the canvas | Replace the traced path with your own closed stroke |
| Example shape | Load a built-in shape (circle, square, star, heart, Lissajous) |
| Circles | How many Fourier terms to keep, largest amplitude first |
| Speed | Loop rate, from a still frame up to 3x |
| Circles / Radii / Original path | Toggle each drawn layer |
| Pause / Play | Freeze or resume the animation |
| Clear | Empty the canvas to draw again |

Keyboard: focus the canvas, then press <kbd>Space</kbd> to play or pause and
<kbd>R</kbd> to reset. Control changes are announced through a polite live
region, and when the browser reports `prefers-reduced-motion` the finished
curve is shown as a still image instead of an animated pen.

## Tests

```bash
npm test
```

The suite (`node --test`) covers the pure math core: the DFT and its
reconstruction guarantee, the epicycle evaluation, arc-length resampling, and
the example-shape generators. It has no dependencies.

## How it works

1. The drawn stroke is resampled to a fixed number of evenly spaced points
   along its arc length, so playback speed is uniform.
2. Each point becomes a complex number `x + iy`. The DFT turns those samples
   into a set of terms, each with a frequency, amplitude, and phase.
3. Terms are sorted by amplitude. Keeping the largest `k` of them gives a
   smooth approximation; adding more terms sharpens the corners.
4. At time `t`, term `n` contributes a vector of length `amp` rotating at
   `freq` cycles per loop, offset by `phase`. Summing the vectors tip-to-tail
   gives the pen position; the partial sums are the circle centers.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/dft.js` | Forward DFT and term extraction |
| `src/epicycles.js` | Evaluate the epicycle chain at a given time |
| `src/resample.js` | Arc-length resampling of a polyline |
| `src/shapes.js` | Built-in parametric example shapes |
| `src/render.js` | Canvas drawing helpers and theme color lookup |
| `src/app.js` | State, animation loop, and control wiring |
| `src/ui.js` | Pointer drawing capture |
| `scripts/serve.js` | Dependency-free static dev server |
| `test/` | Node test suite for the math core |

## License

MIT
