/**
 * Turns pointer input on a pane into annotations, according to the active tool:
 *
 *   select      click an annotation to edit it
 *   highlight / underline / squiggly / strikeout
 *               releasing over selected text applies the markup
 *   note        click (or tap) anywhere to pin a note
 *   pen/marker  freehand ink — mouse, finger or stylus
 *   eraser      click or drag across annotations to delete them
 *
 * `applyMarkup` and `addNoteToSelection` are also used by keyboard
 * shortcuts and the selection bar.
 */
import { selectionByPage, clearSelection } from './text-selection.ts';
import { smoothPath } from '../../lib/geometry.ts';
import { svgEl } from '../dom.ts';
import type { ReaderPane } from '../reader-pane.ts';
import type { PageElement, PageView } from '../page-view.ts';
import type { Book } from '../../models/book.ts';
import type { MarkupType, PdfPoint } from '../../models/types.ts';

const INK_MIN_POINT_DISTANCE = 0.6; // PDF units; drops jitter between samples
const INK_MERGE_WINDOW_MS = 1500; // strokes in quick succession form one drawing
const NOTE_PIN_SIZE = 18;

export type Tool = 'select' | MarkupType | 'note' | 'pen' | 'marker' | 'eraser';

export interface ToolSettings {
  current(): Tool;
  colorFor(tool: Tool): string;
  widthFor(tool: Tool): number;
}

export interface AnnotationCallbacks {
  /** An annotation should open in the editor, anchored near a screen point. */
  edit(pane: ReaderPane, id: string, at?: { x: number; y: number }): void;
}

const isMarkup = (tool: Tool): tool is MarkupType => ['highlight', 'underline', 'squiggly', 'strikeout'].includes(tool);
const isInk = (tool: Tool): tool is 'pen' | 'marker' => tool === 'pen' || tool === 'marker';

export class AnnotationController {
  readonly #tools: ToolSettings;
  readonly #callbacks: AnnotationCallbacks;
  #lastInk: { id: string; at: number } | null = null;

  constructor(tools: ToolSettings, callbacks: AnnotationCallbacks) {
    this.#tools = tools;
    this.#callbacks = callbacks;
  }

  /** Wires input handling for a pane. */
  attach(pane: ReaderPane): void {
    pane.el.addEventListener('pointerdown', (e) => this.#onPointerDown(pane, e));
    pane.el.addEventListener('pointerup', () => this.#onPointerUp(pane));
    pane.el.addEventListener('click', (e) => this.#onClick(pane, e));
  }

  // ---- Creation ---------------------------------------------------------------

  /** Applies a markup to the current selection. Returns how many pages it touched. */
  applyMarkup(pane: ReaderPane, type: MarkupType, color = this.#tools.colorFor(type)): number {
    const parts = selectionByPage(pane);
    for (const part of parts) pane.book.annotations.add({ type, page: part.page, color, textQuoted: part.text, rects: part.rects });
    if (parts.length) clearSelection();
    return parts.length;
  }

  /** Pins a note at the end of the selected text and opens its editor. */
  addNoteToSelection(pane: ReaderPane): boolean {
    const parts = selectionByPage(pane);
    if (!parts.length) return false;
    const { page, rects } = parts[0];
    const lastLine = rects[rects.length - 1];
    const note = pane.book.annotations.add({
      type: 'note',
      page,
      color: this.#tools.colorFor('note'),
      textQuoted: parts.map((p) => p.text).join(' '),
      rects: [{ x1: lastLine.x2 + 2, y1: lastLine.y2 - NOTE_PIN_SIZE, x2: lastLine.x2 + 2 + NOTE_PIN_SIZE, y2: lastLine.y2 }],
      comment: '',
    });
    clearSelection();
    requestAnimationFrame(() => this.#callbacks.edit(pane, note.id));
    return true;
  }

  // ---- Pointer handling -------------------------------------------------------

  #viewAt(pane: ReaderPane, event: Event): PageView | null {
    const node = (event.target as Element | null)?.closest?.('.page') as PageElement | null;
    return node && pane.el.contains(node) ? (node.pageView ?? null) : null;
  }

  #onPointerDown(pane: ReaderPane, event: PointerEvent): void {
    if (event.button !== 0) return;
    const view = this.#viewAt(pane, event);
    if (!view) return;
    const tool = this.#tools.current();
    if (isInk(tool)) {
      event.preventDefault();
      this.#drawInk(pane, view, event, tool);
    } else if (tool === 'eraser') {
      event.preventDefault();
      this.#erase(pane, event);
    }
  }

  #onPointerUp(pane: ReaderPane): void {
    const tool = this.#tools.current();
    // Let the selection settle before reading it.
    if (isMarkup(tool)) setTimeout(() => this.applyMarkup(pane, tool), 0);
  }

  #onClick(pane: ReaderPane, event: MouseEvent): void {
    const tool = this.#tools.current();
    const hit = (event.target as Element | null)?.closest?.('.annot') as SVGGElement | null;
    if (hit && (tool === 'select' || isMarkup(tool)) && window.getSelection()?.isCollapsed !== false) {
      event.stopPropagation();
      this.#callbacks.edit(pane, hit.dataset.id!, { x: event.clientX, y: event.clientY });
      return;
    }
    if (tool !== 'note') return;
    const view = this.#viewAt(pane, event);
    if (!view) return;
    const [x, y] = view.clientToPdf(event.clientX, event.clientY);
    const note = pane.book.annotations.add({
      type: 'note',
      page: view.pageNumber,
      color: this.#tools.colorFor('note'),
      rects: [{ x1: x, y1: y - NOTE_PIN_SIZE, x2: x + NOTE_PIN_SIZE, y2: y }],
      comment: '',
    });
    requestAnimationFrame(() => this.#callbacks.edit(pane, note.id));
  }

  // Draws a live preview while the pointer moves, then commits on release.
  #drawInk(pane: ReaderPane, view: PageView, event: PointerEvent, tool: 'pen' | 'marker'): void {
    const color = this.#tools.colorFor(tool);
    const width = this.#tools.widthFor(tool);
    const points: PdfPoint[] = [];
    const preview = svgEl('path', { stroke: color, 'stroke-width': width, class: tool === 'marker' ? 'ink marker' : 'ink' });
    view.overlayGroup.append(preview);

    const addPoint = (e: PointerEvent) => {
      const [x, y] = view.clientToPdf(e.clientX, e.clientY);
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < INK_MIN_POINT_DISTANCE) return;
      points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      preview.setAttribute('d', smoothPath(points));
    };
    // Coalesced events give pens and fast mice their full sample rate.
    const onMove = (e: PointerEvent) => (e.getCoalescedEvents?.() ?? [e]).forEach(addPoint);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      preview.remove();
      if (points.length) this.#commitStroke(pane.book, { page: view.pageNumber, tool, color, width, points });
    };
    addPoint(event);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  #commitStroke(book: Book, s: { page: number; tool: 'pen' | 'marker'; color: string; width: number; points: PdfPoint[] }): void {
    const previous = this.#lastInk && book.annotations.get(this.#lastInk.id);
    const continues =
      previous &&
      previous.page === s.page &&
      previous.tool === s.tool &&
      previous.color === s.color &&
      previous.strokeWidth === s.width &&
      Date.now() - this.#lastInk!.at < INK_MERGE_WINDOW_MS;
    if (continues) {
      book.annotations.update(previous.id, { paths: [...(previous.paths ?? []), s.points] });
      this.#lastInk!.at = Date.now();
    } else {
      const drawing = book.annotations.add({ type: 'freehand', tool: s.tool, page: s.page, color: s.color, strokeWidth: s.width, paths: [s.points] });
      this.#lastInk = { id: drawing.id, at: Date.now() };
    }
  }

  #erase(pane: ReaderPane, event: PointerEvent): void {
    const eraseAt = (e: PointerEvent) => {
      const node = document.elementFromPoint(e.clientX, e.clientY)?.closest('.annot') as SVGGElement | null;
      if (node && pane.el.contains(node) && node.dataset.id) pane.book.annotations.remove(node.dataset.id);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', eraseAt);
      window.removeEventListener('pointerup', onUp);
    };
    eraseAt(event);
    window.addEventListener('pointermove', eraseAt);
    window.addEventListener('pointerup', onUp);
  }
}
