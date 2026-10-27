/**
 * Off-screen page rendering for analysis (cropping, OCR, covers): always
 * untinted on white, independent of the reader's theme.
 */
import type { PageViewport } from 'pdfjs-dist';
import type { PdfDocument } from '../models/pdf-document.ts';

export async function rasterizePage(
  doc: PdfDocument,
  pageNumber: number,
  size: { width: number } | { scale: number },
): Promise<{ canvas: HTMLCanvasElement; viewport: PageViewport }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 'scale' in size ? size.scale : size.width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, viewport };
}
