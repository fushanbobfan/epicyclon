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
| Copy link | Put a permalink to the current view on the clipboard |
| Download SVG | Save the reconstructed curve as a standalone vector file |
| Download PNG | Save the reconstructed curve as a bitmap image |
| Import SVG&hellip; | Trace an SVG file's path instead of drawing or picking a preset |

Below the canvas, a magnitude-spectrum strip shows the kept terms as bars,
tallest first, so you can watch amplitude fall off as circles are added; its
caption calls out the dominant frequency.

Keyboard: focus the canvas, then press <kbd>Space</kbd> to play or pause and
<kbd>R</kbd> to reset. Control changes are announced through a polite live
region, and when the browser reports `prefers-reduced-motion` the finished
curve is shown as a still image instead of an animated pen.

## Sharing a view

**Copy link** encodes the whole view into the URL hash: the source curve
(a named preset, or your stroke rounded to whole pixels), the circle count,
the speed, and which layers are visible. Opening that link restores the view;
the hash also updates in place as you change controls, so a browser bookmark
captures wherever you left off. A shared stroke is resampled on load, so the
link stays a few kilobytes even for a detailed drawing.

## Downloading a vector copy

**Download SVG** samples the epicycle chain around one full loop and writes the
resulting curve as a single-`<path>` SVG document — no stylesheet, font, or
script. The `viewBox` is fitted to the drawing with a small uniform margin, the
stroke picks up the current theme's trace color, and the `<title>` records the
source shape and circle count. Fewer circles export a smoother curve; more sharpen
the corners, exactly as on screen. The file opens in any vector editor and is
suitable for a pen plotter.

## Downloading a raster copy

**Download PNG** paints the same reconstructed curve onto an offscreen canvas
and saves it as a PNG. The bitmap is fitted to the drawing with a uniform
margin, then scaled by the display's device pixel ratio so the line stays
crisp on a high-DPI screen; the longest edge is capped so a large drawing can
never request a gigapixel image. The page color and stroke follow the current
light or dark theme. As with the SVG, fewer circles give a smoother curve and
more sharpen the corners. Use this when you want an image to drop straight
into a document or a chat rather than a vector file to edit.

## Importing an SVG

**Import SVG&hellip;** is the reverse of **Download SVG**: pick a local `.svg` file and its
path becomes the traced curve, the same as drawing a stroke or picking an example shape. Every
`<path>` element is parsed and, when a file has more than one (or more than one subpath within
one `M`&hellip;`Z`&hellip;`M`&hellip;`Z` string), the one with the largest bounding box is used —
so a small decorative dot or a background rectangle drawn as a path doesn't win over the actual
artwork. The path's `M`/`L`/`H`/`V`/`C`/`S`/`Q`/`T`/`A`/`Z` commands are supported, both absolute
and relative; curves and arcs alike are flattened to short line segments before resampling, the
same as a freehand stroke. The imported path is recentered and scaled to fit the canvas the same
way a built-in example shape is, so its original position and size in the source file don't
matter.

## Tests

```bash
npm test
```

The suite (`node --test`) covers the pure logic: the DFT and its
reconstruction guarantee, the epicycle evaluation, arc-length resampling, the
example-shape generators, the permalink encode/decode round trip, the spectrum
reduction, the SVG export (path data, viewBox fitting, escaping, and
degenerate inputs), the PNG export plan (bounds fitting, device scaling,
size caps, and degenerate inputs), and the SVG import (path-command parsing,
curve flattening, subpath selection, and centering/scaling). It has no
dependencies.

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
| `src/spectrum.js` | Reduce a term set to magnitude-spectrum bars |
| `src/svg.js` | Build a standalone SVG document from a traced curve |
| `src/raster.js` | Plan a PNG export: fit, scale, and cap the bitmap |
| `src/svgImport.js` | Parse an SVG path into a traceable, centered polyline |
| `src/share.js` | Encode and decode the permalink hash |
| `src/app.js` | State, animation loop, and control wiring |
| `src/ui.js` | Pointer drawing capture |
| `scripts/serve.js` | Dependency-free static dev server |
| `test/` | Node test suite for the math core |

## License

MIT
