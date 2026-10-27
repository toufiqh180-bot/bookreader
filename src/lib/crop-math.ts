/**
 * Smart margin cropping — the pure half (no rendering).
 *
 * `inkBounds` finds the bounding box of non-background pixels in an RGBA
 * buffer. `cropFromSamples` turns ink boxes from a sample of pages into one
 * crop for odd and one for even pages (printed books mirror their margins).
 * Each edge uses a generous percentile across samples rather than the
 * extreme, so one full-bleed image doesn't defeat the crop, and the crop is
 * uniform so the text never jumps between pages.
 *
 * Boxes are fractions of the page, origin top-left.
 */
import { percentile } from './util.ts';
import type { CropBox, CropBoxes } from '../models/types.ts';

export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const INK_LUMINANCE = 200; // darker than this counts as ink (0–255)
const SCAN_BORDER = 0.015; // ignore dark scanner edges in the outer 1.5%
const PADDING = 0.025;
const EDGE_PERCENTILE = 0.1;
const MIN_CONTENT = 0.15; // ignore near-empty pages (blank / page number only)

/** @returns null for a blank page */
export function inkBounds(rgba: ArrayLike<number>, width: number, height: number): InkBox | null {
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

/** Evenly spaced pages to sample, skipping a couple at each end of long books (covers). */
export function samplePages(pageCount: number, maxSamples = 48): number[] {
  const skip = pageCount > 12 ? 2 : 0;
  const span = Math.max(1, pageCount - skip * 2);
  const count = Math.min(maxSamples, span);
  const pages = new Set<number>();
  for (let i = 0; i < count; i++) pages.add(Math.min(pageCount, skip + 1 + Math.floor((span * i) / count)));
  return [...pages];
}

export function cropFromSamples(samples: Array<{ page: number; box: InkBox | null }>): CropBoxes | null {
  const usable = samples.filter((s): s is { page: number; box: InkBox } =>
    Boolean(s.box && s.box.x1 - s.box.x0 > MIN_CONTENT && s.box.y1 - s.box.y0 > MIN_CONTENT),
  );
  const odd = combine(usable.filter((s) => s.page % 2 === 1).map((s) => s.box));
  const even = combine(usable.filter((s) => s.page % 2 === 0).map((s) => s.box));
  if (!odd && !even) return null;
  return { odd: (odd ?? even)!, even: (even ?? odd)! };
}

function combine(boxes: InkBox[]): CropBox | null {
  if (!boxes.length) return null;
  // Outer edges at a generous percentile, then padded and clamped to the page.
  const values = (edge: keyof InkBox) => boxes.map((b) => b[edge]);
  const low = (edge: keyof InkBox) => Math.max(0, percentile(values(edge), EDGE_PERCENTILE) - PADDING);
  const high = (edge: keyof InkBox) => Math.min(1, percentile(values(edge), 1 - EDGE_PERCENTILE) + PADDING);
  const [x0, y0, x1, y1] = [low('x0'), low('y0'), high('x1'), high('y1')];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
