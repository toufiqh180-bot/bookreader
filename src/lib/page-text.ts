/**
 * A page's text as one searchable string plus the positioned runs it came
 * from, so a character range can be mapped back to rectangles on the page.
 * Two sources produce the same shape: native PDF text (pdf.js items) and OCR.
 */
import type { OcrPage, OcrWord, PdfRect } from '../models/types.ts';

export interface TextRun {
  /** Offset of this run within `PageText.str`. */
  start: number;
  str: string;
  /** Run ends a line. */
  eol: boolean;
  /** pdf.js text matrix [a, b, c, d, x, y] (native runs). */
  transform?: number[];
  /** Advance width in PDF units (native runs). */
  width?: number;
  /** Font height in PDF units (native runs). */
  height?: number;
  /** Source word (OCR runs). */
  word?: OcrWord;
  /** OCR reported a paragraph break after this run. */
  paragraphEnd?: boolean;
}

export interface PageText {
  str: string;
  runs: TextRun[];
  /** Enough real characters to count as a text page (not a bare scan). */
  hasText: boolean;
}

/** The subset of pdf.js `TextItem` we rely on. Marked-content items have no `str`. */
export interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

const MIN_CHARS_FOR_REAL_TEXT = 8;

export function pageTextFromPdfItems(items: PdfTextItem[]): PageText {
  const runs: TextRun[] = [];
  let str = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    runs.push({ start: str.length, str: item.str, eol: Boolean(item.hasEOL), transform: item.transform, width: item.width, height: item.height });
    str += item.str + (item.hasEOL ? '\n' : '');
  }
  return { str, runs, hasText: str.replace(/\s/g, '').length > MIN_CHARS_FOR_REAL_TEXT };
}

export function pageTextFromOcr(ocr: OcrPage): PageText {
  const runs: TextRun[] = [];
  let str = '';
  for (const line of ocr.lines) {
    line.words.forEach((word, i) => {
      const eol = i === line.words.length - 1;
      runs.push({ start: str.length, str: word.t, eol, word, paragraphEnd: eol && Boolean(line.pe) });
      str += word.t + (eol ? '\n' : ' ');
    });
  }
  return { str, runs, hasText: runs.length > 0 };
}

/**
 * PDF-space rectangles covering characters [start, end) of `text.str`.
 * Positions inside a run are interpolated linearly — exact for monospaced
 * text, close enough for search highlights otherwise. Rotated text is skipped.
 */
export function rectsForRange(text: PageText, start: number, end: number): PdfRect[] {
  const rects: PdfRect[] = [];
  for (const run of text.runs) {
    const from = Math.max(start, run.start);
    const to = Math.min(end, run.start + run.str.length);
    if (from >= to || !run.str.length) continue;
    const f0 = (from - run.start) / run.str.length;
    const f1 = (to - run.start) / run.str.length;
    if (run.word) {
      const { x1, x2, y1, y2 } = run.word;
      rects.push({ x1: x1 + (x2 - x1) * f0, x2: x1 + (x2 - x1) * f1, y1, y2 });
      continue;
    }
    if (!run.transform) continue;
    const [a, b, , d, x, y] = run.transform;
    if (Math.abs(Math.atan2(b, a)) > 0.01) continue;
    const height = run.height || Math.abs(d) || 10;
    const width = run.width ?? 0;
    // Baseline-relative box: descenders ≈ 22% below, ascenders ≈ 88% above.
    rects.push({ x1: x + width * f0, x2: x + width * f1, y1: y - height * 0.22, y2: y + height * 0.88 });
  }
  return rects;
}
