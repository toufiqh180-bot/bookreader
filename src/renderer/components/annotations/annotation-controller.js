/**
 * Turns user input on a pane into annotations, according to the active tool:
 *
 *   select      click an annotation to edit it; selecting text shows the selection bar
 *   highlight / underline / squiggly / strikeout
 *               releasing the mouse over selected text applies the markup
 *   note        click anywhere to pin a note
 *   pen/marker  freehand ink (pressure-capable pointers supported)
 *   eraser      click or drag across annotations to delete them
 *
 * Creation helpers (`applyMarkup`, `addNoteToSelection`) are also used by
 * keyboard shortcuts and the selection bar.
 */
import { selectionByPage, clearSelection } from './text-selection.js';
import { smoothPath } from '../../lib/geometry.js';
import { svgEl } from '../common/dom.js';

const INK_MIN_POINT_DISTANCE = 0.6; // PDF units; drops jitter between samples
const INK_MERGE_WINDOW_MS = 1500; // strokes in quick succession form one drawing
const NOTE_PIN_SIZE = 18;

export class AnnotationController {
  /**
   * @param {{
   *   tools: import('../../app/tool-state.js').ToolState,
   *   editor: import('./annotation-editor.js').AnnotationEditor,
   *   selectionBar: import('./selection-bar.js').SelectionBar,
   * }} deps
   */
  constructor({ tools, editor, selectionBar }) {
    this.tools = tools;
    this.editor = editor;
    this.selectionBar = selectionBar;
    this.lastInk = null;
  }

  /** Wires input handling for a pane. */
  attach(pane) {
    pane.el.addEventListener('pointerdown', (e) => this.#onPointerDown(pane, e));
    pane.el.addEventListener('pointerup', () => this.#onPointerUp(pane));
    pane.el.addEventListener('click', (e) => this.#onClick(pane, e));
  }

  // ---- Creation -----------------------------------------------------------

  /** Applies a text markup to the current selection. @returns {number} annotations created */
  applyMarkup(pane, type, color = this.tools.colorFor(type)) {
    const parts = selectionByPage(pane);
    for (const part of parts) {
      pane.book.annotations.add({ type, page: part.page, color, textQuoted: part.text, rects: part.rects });
    }
    if (parts.length) {
      clearSelection();
      this.selectionBar.hide();
    }
    return parts.length;
  }

  /** Pins a note at the end of the selected text and opens its editor. @returns {boolean} */
  addNoteToSelection(pane) {
    const parts = selectionByPage(pane);
    if (!parts.length) return false;
    const { page, rects } = parts[0];
    const lastLine = rects[rects.length - 1];
    const note = pane.book.annotations.add({
      type: 'note',
      page,
      color: this.tools.colorFor('note'),
      textQuoted: parts.map((p) => p.text).join(' '),
      rects: [{ x1: lastLine.x2 + 2, y1: lastLine.y2 - NOTE_PIN_SIZE, x2: lastLine.x2 + 2 + NOTE_PIN_SIZE, y2: lastLine.y2 }],
      comment: '',
    });
    clearSelection();
    this.selectionBar.hide();
    requestAnimationFrame(() => this.editor.open(pane, note.id, { focus: true }));
    return true;
  }

  // ---- Pointer handling ---------------------------------------------------

  #pageAt(pane, event) {
    const node = event.target.closest?.('.page');
    return node && pane.el.contains(node) ? node.pageView : null;
  }

  #onPointerDown(pane, event) {
    if (event.button !== 0) return;
    const pv = this.#pageAt(pane, event);
    if (!pv) return;
    if (this.tools.isInk) {
      event.preventDefault();
      this.#drawInk(pane, pv, event);
    } else if (this.tools.current === 'eraser') {
      event.preventDefault();
      this.#erase(pane, event);
    }
  }

  #onPointerUp(pane) {
    // Let the selection settle before reading it.
    if (this.tools.isMarkup) setTimeout(() => this.applyMarkup(pane, this.tools.current), 0);
  }

  #onClick(pane, event) {
    const hit = event.target.closest?.('.annot');
    const canEdit = this.tools.current === 'select' || this.tools.isMarkup;
    if (hit && canEdit && window.getSelection().isCollapsed) {
      event.stopPropagation();
      this.editor.open(pane, hit.dataset.id, { at: { x: event.clientX, y: event.clientY } });
      return;
    }
    if (this.tools.current === 'note') {
      const pv = this.#pageAt(pane, event);
      if (!pv) return;
      const [x, y] = pv.clientToPdf(event.clientX, event.clientY);
      const note = pane.book.annotations.add({
        type: 'note',
        page: pv.pageNumber,
        color: this.tools.colorFor('note'),
        rects: [{ x1: x, y1: y - NOTE_PIN_SIZE, x2: x + NOTE_PIN_SIZE, y2: y }],
        comment: '',
      });
      requestAnimationFrame(() => this.editor.open(pane, note.id, { focus: true }));
    }
  }

  // Draws a live preview while the pointer moves, then commits on release.
  #drawInk(pane, pv, event) {
    const tool = this.tools.current;
    const color = this.tools.colorFor(tool);
    const width = this.tools.widthFor(tool);
    const points = [];
    const preview = svgEl('path', { stroke: color, 'stroke-width': width, class: tool === 'marker' ? 'ink marker' : 'ink' });
    pv.overlayGroup.append(preview);

    const addPoint = (e) => {
      const [x, y] = pv.clientToPdf(e.clientX, e.clientY);
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < INK_MIN_POINT_DISTANCE) return;
      points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      preview.setAttribute('d', smoothPath(points));
    };
    // Coalesced events give pens and fast mice their full sample rate.
    const onMove = (e) => (e.getCoalescedEvents?.() ?? [e]).forEach(addPoint);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      preview.remove();
      if (points.length) this.#commitStroke(pane.book, { page: pv.pageNumber, tool, color, width, points });
    };
    addPoint(event);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  #commitStroke(book, { page, tool, color, width, points }) {
    const previous = this.lastInk && book.annotations.get(this.lastInk.id);
    const continues =
      previous &&
      previous.page === page &&
      previous.tool === tool &&
      previous.color === color &&
      previous.strokeWidth === width &&
      Date.now() - this.lastInk.at < INK_MERGE_WINDOW_MS;
    if (continues) {
      book.annotations.update(previous.id, { paths: [...previous.paths, points] });
    } else {
      const drawing = book.annotations.add({ type: 'freehand', tool, page, color, strokeWidth: width, paths: [points] });
      this.lastInk = { id: drawing.id };
    }
    this.lastInk.at = Date.now();
  }

  #erase(pane, event) {
    const eraseAt = (e) => {
      const node = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.annot');
      if (node && pane.el.contains(node)) pane.book.annotations.remove(node.dataset.id);
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
