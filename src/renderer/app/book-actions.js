/**
 * Longer-running document operations: export, PDF flattening, OCR, margin
 * detection, deep links and library covers. Each reports progress through
 * toasts and leaves the UI usable while it runs.
 */
import { toMarkdown, toPlainText, toJson } from '../lib/export-format.js';
import { buildDeepLink } from '../lib/deep-link.js';
import { toBox } from '../lib/geometry.js';
import { detectMargins } from '../services/margin-crop.js';
import { recognizePage } from '../services/ocr.js';
import { rasterizePage } from '../services/page-raster.js';
import { selectionByPage } from '../components/annotations/text-selection.js';
import { toast } from '../components/common/overlays.js';

const COVER_WIDTH_PX = 240;
const baseName = (book) => book.fileName.replace(/\.pdf$/i, '');

// ---- Export -------------------------------------------------------------------

const EXPORTERS = {
  md: { serialize: toMarkdown, suffix: 'notes' },
  txt: { serialize: toPlainText, suffix: 'notes' },
  json: { serialize: toJson, suffix: 'annotations' },
};

/** @param {import('../models/book.js').Book} book @param {'md'|'txt'|'json'} format */
export async function exportAnnotations(book, format) {
  const { serialize, suffix } = EXPORTERS[format];
  const content = serialize(book.record, (page) => book.pageLabel(page));
  const saved = await window.api.exportText({ defaultName: `${baseName(book)} — ${suffix}.${format}`, content, ext: format });
  if (saved) toast(`Exported to ${saved.split(/[\\/]/).pop()}`, { action: { label: 'Show', run: () => window.api.revealInFolder(saved) } });
}

/**
 * Writes a copy of the PDF with annotations burned into the page content
 * (and/or OCR text embedded invisibly) so any PDF app shows them.
 */
export async function exportPdf(book, { annotations = true, ocr = false } = {}) {
  if (ocr && !Object.keys(book.ocr).length) {
    toast('No OCR text yet — run Tools → Recognize Text first.');
    return;
  }
  const progress = toast('Building PDF…', { duration: 0 });
  try {
    const saved = await window.api.exportPdf({
      sourcePath: book.filePath,
      annotations: annotations ? book.annotations.items : [],
      ocr: ocr ? book.ocr : {},
      defaultName: `${baseName(book)} (${ocr ? 'searchable' : 'annotated'}).pdf`,
    });
    progress.close();
    if (saved) toast(`Saved ${saved.split(/[\\/]/).pop()}`, { action: { label: 'Show', run: () => window.api.revealInFolder(saved) } });
  } catch (error) {
    progress.close();
    toast(`Could not save PDF: ${error.message}`);
  }
}

// ---- OCR ----------------------------------------------------------------------

let ocrJob = null;

/**
 * Recognises text on the given pages, skipping pages that already have text.
 * Only one OCR job runs at a time; it can be cancelled from its toast.
 *
 * @param {import('../models/book.js').Book} book
 * @param {number[]} pages
 */
export async function runOcr(book, pages) {
  if (ocrJob) {
    toast('Text recognition is already running.');
    return;
  }
  const pending = [];
  for (const page of pages) {
    if (!book.hasOcr(page) && !(await book.doc.getText(page)).text.hasText) pending.push(page);
  }
  if (!pending.length) {
    toast(pages.length === 1 ? 'This page already has selectable text.' : 'All pages already have selectable text.');
    return;
  }
  ocrJob = { cancelled: false };
  const job = ocrJob;
  const progress = toast(`Recognizing text… 0 / ${pending.length}`, { duration: 0, action: { label: 'Cancel', run: () => (job.cancelled = true) } });
  let done = 0;
  try {
    for (const page of pending) {
      if (job.cancelled) break;
      book.setOcr(page, await recognizePage(book.doc, page));
      done++;
      progress.update(`Recognizing text… ${done} / ${pending.length}`);
      if (done % 5 === 0) await book.saveOcr();
    }
    await book.saveOcr();
    progress.close();
    toast(job.cancelled ? `Stopped after ${done} page(s).` : `Text recognized on ${done} page(s). You can now select, search and highlight it.`);
  } catch (error) {
    progress.close();
    toast(`Text recognition failed: ${error.message}`);
  } finally {
    ocrJob = null;
  }
}

// ---- Margin crop --------------------------------------------------------------

/** Computes (once per book, cached) and returns the crop boxes, or null. */
export async function ensureCrop(book, { force = false } = {}) {
  if (book.crop && !force) return book.crop;
  const progress = toast('Detecting margins…', { duration: 0 });
  try {
    const crop = await detectMargins(book, (fraction) => progress.update(`Detecting margins… ${Math.round(fraction * 100)}%`));
    progress.close();
    if (!crop) {
      toast('Could not find any page content to crop to.');
      return null;
    }
    await book.setCrop(crop);
    return crop;
  } catch (error) {
    progress.close();
    toast(`Margin detection failed: ${error.message}`);
    return null;
  }
}

// ---- Deep links ---------------------------------------------------------------

/**
 * Copies a bookreader:// link to the current spot — or, if text is selected,
 * to that passage (its first line's box and the page range it spans).
 *
 * @param {import('../components/reader/reader-pane.js').ReaderPane} pane
 */
export async function copyDeepLink(pane) {
  const { book } = pane;
  const selection = selectionByPage(pane);
  let link;
  if (selection.length) {
    const first = toBox(selection[0].rects[0]);
    link = buildDeepLink({
      bookId: book.id,
      file: book.filePath,
      page: selection[0].page,
      endPage: selection[selection.length - 1].page,
      x: first.x,
      y: first.y + first.h,
      x2: first.x + first.w,
      y2: first.y,
    });
  } else {
    const { page, x, y } = pane.currentPosition();
    link = buildDeepLink({ bookId: book.id, file: book.filePath, page, x, y });
  }
  await window.api.copyText(link);
  toast(selection.length ? 'Link to passage copied' : 'Link to this spot copied');
}

// ---- Library cover ------------------------------------------------------------

/** Saves a small render of page 1 for the library screen (first open only). */
export async function saveCover(book) {
  const { canvas } = await rasterizePage(book.doc, 1, { width: COVER_WIDTH_PX });
  await window.api.saveCover(book.id, canvas.toDataURL('image/jpeg', 0.82));
}
