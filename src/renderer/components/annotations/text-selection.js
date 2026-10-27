/**
 * Converts the browser's text selection into annotation geometry.
 *
 * The selection lives in the pdf.js text layer — transparent spans placed
 * exactly over the glyphs — so the selection's client rects are the glyph
 * boxes. We split the selection per page, merge glyph boxes into lines, and
 * convert them to PDF user space, where they stay locked to the text at any
 * zoom or crop.
 */
import { mergeIntoLines, round2 } from '../../lib/geometry.js';

/**
 * @typedef {{ page: number, text: string, rects: import('../../lib/geometry.js').PdfRect[] }} PageSelection
 *
 * @param {import('../reader/reader-pane.js').ReaderPane} pane
 * @returns {PageSelection[]} one entry per page touched, in page order
 */
export function selectionByPage(pane) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
  const range = selection.getRangeAt(0);
  const result = [];

  for (const pv of pane.pageViews.values()) {
    const layer = pv.textLayer;
    if (!pv.layersBuilt || !layer.isConnected || !range.intersectsNode(layer)) continue;

    // Clamp the range to this page's text layer.
    const pageRange = range.cloneRange();
    if (!layer.contains(range.startContainer)) pageRange.setStart(layer, 0);
    if (!layer.contains(range.endContainer)) pageRange.setEnd(layer, layer.childNodes.length);

    const text = rangeText(pageRange);
    const lines = mergeIntoLines([...pageRange.getClientRects()]);
    if (!text || !lines.length) continue;

    const rects = lines.map((line) => {
      const [ax, ay] = pv.clientToPdf(line.left, line.bottom);
      const [bx, by] = pv.clientToPdf(line.right, line.top);
      return { x1: round2(Math.min(ax, bx)), y1: round2(Math.min(ay, by)), x2: round2(Math.max(ax, bx)), y2: round2(Math.max(ay, by)) };
    });
    result.push({ page: pv.pageNumber, text, rects });
  }
  return result.sort((a, b) => a.page - b.page);
}

/**
 * Text of a range with line breaks kept as spaces. `Range.toString()` drops
 * the text layer's <br> line separators, gluing the last word of one line
 * to the first word of the next.
 */
export function rangeText(range) {
  const fragment = range.cloneContents();
  for (const br of fragment.querySelectorAll('br')) br.replaceWith(' ');
  return fragment.textContent.replace(/\s+/g, ' ').trim();
}

/** The current selection's text (see {@link rangeText}). */
export function selectedText() {
  const selection = window.getSelection();
  return selection?.rangeCount ? rangeText(selection.getRangeAt(0)) : '';
}

export function clearSelection() {
  window.getSelection()?.removeAllRanges();
}
