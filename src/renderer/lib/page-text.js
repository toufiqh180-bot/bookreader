/**
 * A page's text in one searchable string plus the positioned runs it came
 * from, so a character range can be mapped back to rectangles on the page.
 *
 * Two sources produce the same shape:
 *   - native PDF text (pdf.js `getTextContent()` items), and
 *   - OCR output for scanned pages.
 *
 * @typedef {{ t: string, x1: number, y1: number, x2: number, y2: number }} OcrWord
 * @typedef {{ words: OcrWord[], pe?: boolean }} OcrLine          pe = ends a paragraph
 * @typedef {{ lines: OcrLine[] }} OcrPage
 *
 * @typedef {object} TextRun
 * @property {number} start         offset of this run within `PageText.str`
 * @property {string} str
 * @property {boolean} eol          run ends a line
 * @property {number[]} [transform] pdf.js text matrix [a, b, c, d, x, y] (native runs)
 * @property {number} [width]       run advance width in PDF units (native runs)
 * @property {number} [height]      font height in PDF units (native runs)
 * @property {OcrWord} [word]       source word (OCR runs)
 * @property {boolean} [paragraphEnd] OCR reported a paragraph break after this run
 *
 * @typedef {{ str: string, runs: TextRun[], hasText: boolean }} PageText
 */

const MIN_CHARS_FOR_REAL_TEXT = 8;

/** @param {Array<{str?: string, transform: number[], width: number, height: number, hasEOL?: boolean}>} items */
export function pageTextFromPdfItems(items) {
  const runs = [];
  let str = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue; // marked-content markers
    runs.push({ start: str.length, str: item.str, eol: !!item.hasEOL, transform: item.transform, width: item.width, height: item.height });
    str += item.str + (item.hasEOL ? '\n' : '');
  }
  return { str, runs, hasText: str.replace(/\s/g, '').length > MIN_CHARS_FOR_REAL_TEXT };
}

/** @param {OcrPage} ocr */
export function pageTextFromOcr(ocr) {
  const runs = [];
  let str = '';
  for (const line of ocr.lines) {
    line.words.forEach((word, i) => {
      const eol = i === line.words.length - 1;
      runs.push({ start: str.length, str: word.t, eol, word, paragraphEnd: eol && !!line.pe });
      str += word.t + (eol ? '\n' : ' ');
    });
  }
  return { str, runs, hasText: runs.length > 0 };
}

/**
 * PDF-space rectangles covering characters [start, end) of `text.str`.
 * Within a run, character positions are interpolated linearly — exact for
 * monospaced text and close enough for highlighting search hits otherwise.
 * Rotated native text is skipped.
 *
 * @param {PageText} text
 * @returns {import('./geometry.js').PdfRect[]}
 */
export function rectsForRange(text, start, end) {
  const rects = [];
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
    const [a, b, , d, x, y] = run.transform;
    if (Math.abs(Math.atan2(b, a)) > 0.01) continue;
    const height = run.height || Math.abs(d) || 10;
    // Baseline-relative box: descenders ≈ 22% below, ascenders ≈ 88% above.
    rects.push({ x1: x + run.width * f0, x2: x + run.width * f1, y1: y - height * 0.22, y2: y + height * 0.88 });
  }
  return rects;
}
