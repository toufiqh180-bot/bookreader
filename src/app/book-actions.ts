/**
 * Longer-running book operations: export, PDF flattening, OCR, margin
 * detection, deep links and library covers. Each reports progress through
 * toasts and leaves the UI usable while it runs.
 */
import { toast } from 'sonner';
import { EXPORTERS, type ExportFormat } from '../lib/export-format.ts';
import { buildDeepLink, buildWebLink } from '../lib/deep-link.ts';
import { toBox } from '../lib/geometry.ts';
import { fileBaseName } from '../lib/util.ts';
import { detectMargins } from '../services/margin-crop.ts';
import { rasterizePage } from '../services/page-raster.ts';
import { selectionByPage } from '../engine/annotations/text-selection.ts';
import type { Book } from '../models/book.ts';
import type { CropBoxes } from '../models/types.ts';
import type { ReaderPane } from '../engine/reader-pane.ts';
import type { Platform } from '../platform/platform.ts';

const COVER_WIDTH_PX = 240;

function savedToast(platform: Platform, name: string | null, label: string): void {
  if (!name) return;
  const reveal = platform.revealFile;
  toast.success(
    `${label}: ${name.split(/[\\/]/).pop()}`,
    reveal && name.includes('/') ? { action: { label: 'Show', onClick: () => reveal.call(platform, name) } } : undefined,
  );
}

export async function exportAnnotations(platform: Platform, book: Book, format: ExportFormat): Promise<void> {
  const { serialize, suffix, mime } = EXPORTERS[format];
  const name = await platform.saveFile({
    suggestedName: `${fileBaseName(book.fileName)} — ${suffix}.${format}`,
    data: serialize(book.record, (page) => book.pageLabel(page)),
    mimeType: mime,
    extension: format,
  });
  savedToast(platform, name, 'Exported');
}

/**
 * Saves a copy of the PDF with annotations burned into the pages (and/or OCR
 * text embedded invisibly) so every PDF app shows them.
 */
export async function exportPdf(platform: Platform, book: Book, { annotations = true, ocr = false } = {}): Promise<void> {
  if (ocr && !Object.keys(book.ocr).length) {
    toast.info('No recognized text yet', { description: 'Run “Recognize text” first.' });
    return;
  }
  const id = toast.loading('Building PDF…');
  try {
    // pdf-lib is loaded on demand so it doesn't slow down app start-up.
    const { buildAnnotatedPdf } = await import('../services/pdf-export.ts');
    const bytes = await buildAnnotatedPdf(await book.readOriginal(), { annotations: annotations ? book.annotations.items : [], ocr: ocr ? book.ocr : {} });
    toast.dismiss(id);
    const name = await platform.saveFile({
      suggestedName: `${fileBaseName(book.fileName)} (${ocr ? 'searchable' : 'annotated'}).pdf`,
      data: bytes,
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
    savedToast(platform, name, 'Saved');
  } catch (error) {
    toast.error('Could not save the PDF', { id, description: (error as Error).message });
  }
}

let ocrJob: { cancelled: boolean } | null = null;

/** Recognises text on `pages`, skipping pages that already have text. One job at a time. */
export async function runOcr(book: Book, pages: number[]): Promise<void> {
  if (ocrJob) {
    toast.info('Text recognition is already running.');
    return;
  }
  const pending: number[] = [];
  for (const page of pages) if (!book.hasOcr(page) && !(await book.doc.getText(page)).text.hasText) pending.push(page);
  if (!pending.length) {
    toast.info(pages.length === 1 ? 'This page already has selectable text.' : 'Every page already has selectable text.');
    return;
  }
  const job: { cancelled: boolean } = { cancelled: false };
  ocrJob = job;
  const id = toast.loading(`Recognizing text… 0 of ${pending.length}`, { action: { label: 'Cancel', onClick: () => (job.cancelled = true) } });
  let done = 0;
  try {
    // Tesseract is loaded on demand: most books never need it.
    const { recognizePage } = await import('../services/ocr.ts');
    for (const page of pending) {
      if (job.cancelled) break;
      book.setOcr(page, await recognizePage(book.doc, page));
      done++;
      toast.loading(`Recognizing text… ${done} of ${pending.length}`, { id });
      if (done % 5 === 0) await book.saveOcr();
    }
    await book.saveOcr();
    toast.success(job.cancelled ? `Stopped after ${done} page(s)` : `Text recognized on ${done} page(s)`, {
      id,
      description: 'You can now select, search and highlight it.',
      action: undefined,
    });
  } catch (error) {
    toast.error('Text recognition failed', { id, description: (error as Error).message });
  } finally {
    ocrJob = null;
  }
}

/** Computes (once per book, then cached) the margin-crop boxes. */
export async function ensureCrop(book: Book, { force = false } = {}): Promise<CropBoxes | null> {
  if (book.crop && !force) return book.crop;
  const id = toast.loading('Detecting margins…');
  try {
    const crop = await detectMargins(book, (fraction) => toast.loading(`Detecting margins… ${Math.round(fraction * 100)}%`, { id }));
    if (!crop) {
      toast.info('No page content found to crop to.', { id });
      return null;
    }
    await book.setCrop(crop);
    toast.dismiss(id);
    return crop;
  } catch (error) {
    toast.error('Margin detection failed', { id, description: (error as Error).message });
    return null;
  }
}

/**
 * Copies a link to the current spot — or, with text selected, to that passage
 * (its first line and the page range it spans).
 */
export async function copyDeepLink(platform: Platform, pane: ReaderPane): Promise<void> {
  const { book } = pane;
  const selection = selectionByPage(pane);
  const where = { bookId: book.id, file: book.filePath ?? null };
  let link;
  if (selection.length) {
    const first = toBox(selection[0].rects[0]);
    link = {
      ...where,
      page: selection[0].page,
      endPage: selection[selection.length - 1].page,
      x: first.x,
      y: first.y + first.h,
      x2: first.x + first.w,
      y2: first.y,
    };
  } else {
    const { page, x, y } = pane.currentPosition();
    link = { ...where, page, x, y };
  }
  const linkBase = platform.linkBase();
  await platform.copyText(linkBase === 'bookreader' ? buildDeepLink(link) : buildWebLink(link, linkBase));
  toast.success(selection.length ? 'Link to passage copied' : 'Link to this spot copied');
}

/** Saves a small render of page 1 for the library screen. */
export async function saveCover(platform: Platform, book: Book): Promise<void> {
  const { canvas } = await rasterizePage(book.doc, 1, { width: COVER_WIDTH_PX });
  await platform.saveCover(book.id, canvas.toDataURL('image/jpeg', 0.82));
}
