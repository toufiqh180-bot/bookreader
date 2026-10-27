/**
 * Smart margin crop: samples pages at low resolution, measures where the ink
 * is, and derives uniform odd/even crop boxes (see lib/crop-math.js).
 */
import { inkBounds, samplePages, cropFromSamples } from '../lib/crop-math.js';
import { yieldToUi } from '../lib/util.js';
import { rasterizePage } from './page-raster.js';

const ANALYSIS_WIDTH_PX = 220;

/**
 * @param {import('../models/book.js').Book} book
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<{ odd: object, even: object } | null>} null when no content was found
 */
export async function detectMargins(book, onProgress) {
  const pages = samplePages(book.numPages);
  const samples = [];
  for (const [i, page] of pages.entries()) {
    const { canvas } = await rasterizePage(book.doc, page, { width: ANALYSIS_WIDTH_PX });
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    samples.push({ page, box: inkBounds(data, width, height) });
    onProgress?.((i + 1) / pages.length);
    await yieldToUi();
  }
  return cropFromSamples(samples);
}
