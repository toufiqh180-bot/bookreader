/**
 * Smart margin cropping — the pure half (no rendering).
 *
 * `inkBounds` finds the bounding box of non-background pixels in an RGBA
 * buffer. `cropFromSamples` turns ink boxes from a sample of pages into one
 * crop for odd pages and one for even pages (printed books mirror margins).
 * Each edge uses a generous percentile across samples instead of the
 * extreme, so a single full-bleed image or cover doesn't defeat the crop,
 * and the crop is uniform so text never jumps between pages.
 *
 * All boxes are fractions of the page: `{x, y, w, h}` in [0, 1], origin top-left.
 *
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} InkBox
 * @typedef {{ x: number, y: number, w: number, h: number }} CropBox
 */
import { percentile } from './util.js';

const INK_LUMINANCE = 200; // darker than this counts as ink (0–255)
const SCAN_BORDER = 0.015; // ignore dark scanner edges in the outer 1.5%
const PADDING = 0.025;
const EDGE_PERCENTILE = 0.1;
const MIN_CONTENT = 0.15; // ignore near-empty pages (blank / single page number)

/**
 * @param {Uint8ClampedArray} rgba
 * @returns {InkBox|null} null for a blank page
 */
export function inkBounds(rgba, width, height) {
  const border = Math.round(width * SCAN_BORDER);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = border; y < height - border; y++) {
    for (let x = border; x < width - border; x++) {
      const i = (y * width + x) * 4;
      const luminance = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      if (luminance >= INK_LUMINANCE) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x0: minX / width, y0: minY / height, x1: (maxX + 1) / width, y1: (maxY + 1) / height };
}

/**
 * Pages to sample: evenly spaced, skipping a couple of pages at each end of
 * long books (covers and front matter are rarely representative).
 */
export function samplePages(pageCount, maxSamples = 48) {
  const skip = pageCount > 12 ? 2 : 0;
  const span = Math.max(1, pageCount - skip * 2);
  const count = Math.min(maxSamples, span);
  const pages = new Set();
  for (let i = 0; i < count; i++) pages.add(Math.min(pageCount, skip + 1 + Math.floor((span * i) / count)));
  return [...pages];
}

/**
 * @param {Array<{ page: number, box: InkBox|null }>} samples
 * @returns {{ odd: CropBox, even: CropBox } | null}
 */
export function cropFromSamples(samples) {
  const usable = samples.filter(({ box }) => box && box.x1 - box.x0 > MIN_CONTENT && box.y1 - box.y0 > MIN_CONTENT);
  const odd = combine(usable.filter((s) => s.page % 2 === 1).map((s) => s.box));
  const even = combine(usable.filter((s) => s.page % 2 === 0).map((s) => s.box));
  if (!odd && !even) return null;
  return { odd: odd ?? even, even: even ?? odd };
}

/** @param {InkBox[]} boxes */
function combine(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.max(
    0,
    percentile(
      boxes.map((b) => b.x0),
      EDGE_PERCENTILE,
    ) - PADDING,
  );
  const y0 = Math.max(
    0,
    percentile(
      boxes.map((b) => b.y0),
      EDGE_PERCENTILE,
    ) - PADDING,
  );
  const x1 = Math.min(
    1,
    percentile(
      boxes.map((b) => b.x1),
      1 - EDGE_PERCENTILE,
    ) + PADDING,
  );
  const y1 = Math.min(
    1,
    percentile(
      boxes.map((b) => b.y1),
      1 - EDGE_PERCENTILE,
    ) + PADDING,
  );
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
