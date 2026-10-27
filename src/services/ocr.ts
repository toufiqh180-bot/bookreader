/**
 * On-the-fly OCR for scanned pages, fully offline. The page is rendered at
 * ~200 DPI and recognised by Tesseract (WebAssembly, in a web worker) with
 * the bundled English model; word boxes are mapped back into PDF user space
 * so they line up with the page at any zoom.
 */
import { createWorker, type Worker } from 'tesseract.js';
import { round2 } from '../lib/geometry.ts';
import { rasterizePage } from './page-raster.ts';
import type { PdfDocument } from '../models/pdf-document.ts';
import type { OcrPage } from '../models/types.ts';

const TARGET_DPI = 200;
const MAX_EDGE_PX = 2400;
const MIN_WORD_CONFIDENCE = 30;
const LSTM_ONLY = 1; // Tesseract OEM: the neural engine only (smaller, more accurate)

/** Runtime files copied next to the app by vite.config.ts. */
const ASSETS = new URL('vendor/tesseract/', document.baseURI).href;

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', LSTM_ONLY, {
    workerPath: `${ASSETS}worker.min.js`,
    corePath: `${ASSETS}core`,
    langPath: `${ASSETS}lang`,
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false, // load the worker by URL so the app's CSP allows it
  }).catch((error: unknown) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

interface TesseractBlock {
  paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }>;
}

export async function recognizePage(doc: PdfDocument, pageNumber: number): Promise<OcrPage> {
  const page = await doc.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  const scale = Math.min(TARGET_DPI / 72, MAX_EDGE_PX / Math.max(width, height));
  const { canvas, viewport } = await rasterizePage(doc, pageNumber, { scale });

  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
  const lines: OcrPage['lines'] = [];
  for (const block of (data.blocks ?? []) as TesseractBlock[]) {
    for (const paragraph of block.paragraphs) {
      paragraph.lines.forEach((line, i) => {
        const words = line.words
          .filter((w) => w.text.trim() && w.confidence > MIN_WORD_CONFIDENCE)
          .map((w) => {
            // Image y grows downward; PDF y grows upward — convert both corners.
            const [x1, y1] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y1);
            const [x2, y2] = viewport.convertToPdfPoint(w.bbox.x1, w.bbox.y0);
            return { t: w.text, x1: round2(Math.min(x1, x2)), y1: round2(Math.min(y1, y2)), x2: round2(Math.max(x1, x2)), y2: round2(Math.max(y1, y2)) };
          });
        if (words.length) lines.push({ words, pe: i === paragraph.lines.length - 1 });
      });
    }
  }
  return { lines };
}
