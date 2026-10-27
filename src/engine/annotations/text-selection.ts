/**
 * Converts the browser's text selection into annotation geometry.
 *
 * Selections live in the pdf.js text layer — transparent spans laid exactly
 * over the glyphs — so their client rects are the glyph boxes. We split the
 * selection per page view, merge boxes into lines and convert to PDF space,
 * where they stay locked to the text at any zoom, crop or page split.
 */
import { mergeIntoLines, round2 } from '../../lib/geometry.ts';
import type { ReaderPane } from '../reader-pane.ts';
import type { PdfRect } from '../../models/types.ts';

export interface PageSelection {
  page: number;
  text: string;
  rects: PdfRect[];
}

/** One entry per page touched, in page order. */
export function selectionByPage(pane: ReaderPane): PageSelection[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
  const range = selection.getRangeAt(0);
  const result: PageSelection[] = [];

  pane.forEachView((view) => {
    const layer = view.textLayer;
    if (!view.layersBuilt || !layer.isConnected || !range.intersectsNode(layer)) return;
    // Clamp the range to this view's text layer.
    const pageRange = range.cloneRange();
    if (!layer.contains(range.startContainer)) pageRange.setStart(layer, 0);
    if (!layer.contains(range.endContainer)) pageRange.setEnd(layer, layer.childNodes.length);

    const text = rangeText(pageRange);
    const lines = mergeIntoLines(pageRange.getClientRects());
    if (!text || !lines.length) return;
    const rects = lines.map((line) => {
      const [ax, ay] = view.clientToPdf(line.left, line.bottom);
      const [bx, by] = view.clientToPdf(line.right, line.top);
      return { x1: round2(Math.min(ax, bx)), y1: round2(Math.min(ay, by)), x2: round2(Math.max(ax, bx)), y2: round2(Math.max(ay, by)) };
    });
    result.push({ page: view.pageNumber, text, rects });
  });
  return result.sort((a, b) => a.page - b.page);
}

/**
 * Text of a range with line breaks kept as spaces. `Range.toString()` drops
 * the text layer's <br> separators, gluing words across lines together.
 */
export function rangeText(range: Range): string {
  const fragment = range.cloneContents();
  for (const br of fragment.querySelectorAll('br')) br.replaceWith(' ');
  return (fragment.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function selectedText(): string {
  const selection = window.getSelection();
  return selection?.rangeCount ? rangeText(selection.getRangeAt(0)) : '';
}

export function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}
