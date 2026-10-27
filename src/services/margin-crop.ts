/**
 * Smart margin crop: samples pages at low resolution, measures where the ink
 * is, and derives uniform odd/even crop boxes (see lib/crop-math.ts).
 */
import { inkBounds, samplePages, cropFromSamples, type InkBox } from '../lib/crop-math.ts';
import { yieldToUi } from '../lib/util.ts';
import { rasterizePage } from './page-raster.ts';
import type { Book } from '../models/book.ts';
import type { CropBoxes } from '../models/types.ts';

const ANALYSIS_WIDTH_PX = 220;

/** @returns null when no content was found */
export async function detectMargins(book: Book, onProgress?: (fraction: number) => void): Promise<CropBoxes | null> {
  const pages = samplePages(book.numPages);
  const samples: Array<{ page: number; box: InkBox | null }> = [];
  for (const [i, page] of pages.entries()) {
    const { canvas } = await rasterizePage(book.doc, page, { width: ANALYSIS_WIDTH_PX });
    const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    samples.push({ page, box: inkBounds(data, width, height) });
    onProgress?.((i + 1) / pages.length);
    await yieldToUi();
  }
  return cropFromSamples(samples);
}
