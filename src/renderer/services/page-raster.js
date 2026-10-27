/**
 * Off-screen page rendering for analysis (cropping, OCR, covers) — always
 * untinted on a white background, independent of the reader's theme.
 */

/**
 * @param {import('../models/pdf-document.js').PdfDocument} doc
 * @param {number} pageNumber
 * @param {{ width?: number, scale?: number }} size  target width in px, or an explicit scale
 * @returns {Promise<{ canvas: HTMLCanvasElement, viewport: object }>}
 */
export async function rasterizePage(doc, pageNumber, { width, scale }) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: scale ?? width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, viewport };
}
