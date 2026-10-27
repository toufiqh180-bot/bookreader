/**
 * On-the-fly OCR for scanned pages. The page is rendered here at ~200 DPI,
 * recognised by Tesseract in the main process (offline, bundled English
 * model), and the word boxes are mapped back into PDF user space so they
 * line up with the page at any zoom.
 */
import { round2 } from '../lib/geometry.js';
import { rasterizePage } from './page-raster.js';

const TARGET_DPI = 200;
const MAX_EDGE_PX = 2400;

/**
 * @param {import('../models/pdf-document.js').PdfDocument} doc
 * @returns {Promise<import('../lib/page-text.js').OcrPage>}
 */
export async function recognizePage(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  const scale = Math.min(TARGET_DPI / 72, MAX_EDGE_PX / Math.max(width, height));
  const { canvas, viewport } = await rasterizePage(doc, pageNumber, { scale });

  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const lines = await window.api.ocr(new Uint8Array(await png.arrayBuffer()));

  return {
    lines: lines.map((line) => ({
      pe: line.paragraphEnd,
      words: line.words.map((w) => {
        // Image y grows downward; PDF y grows upward — convert both corners.
        const [x1, y1] = viewport.convertToPdfPoint(w.x0, w.y1);
        const [x2, y2] = viewport.convertToPdfPoint(w.x1, w.y0);
        return { t: w.text, x1: round2(Math.min(x1, x2)), y1: round2(Math.min(y1, y2)), x2: round2(Math.max(x1, x2)), y2: round2(Math.max(y1, y2)) };
      }),
    })),
  };
}
