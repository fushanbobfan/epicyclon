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

## Tests

```bash
npm test
```

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
| `src/app.js` | Canvas rendering and animation loop |
| `src/ui.js` | Controls and drawing interaction |
| `test/` | Node test suite for the math core |

## License

MIT
