/**
 * Popover for viewing and editing one annotation: quoted text, colour,
 * comment, delete. Sticky notes open here when clicked — the "collapsible"
 * comment of the spec (closed = pin on the page, open = this editor).
 */
import { el, placeFloating } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { PALETTE } from '../../app/tool-state.js';
import { ANNOTATION_LABELS } from '../../lib/export-format.js';

const QUOTE_PREVIEW_CHARS = 280;

export class AnnotationEditor {
  constructor() {
    this.el = el('div', { class: 'annot-popover', role: 'dialog', hidden: true });
    document.body.append(this.el);
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.hidden && !this.el.contains(e.target) && !e.target.closest?.('.annot-hit')) this.close();
    });
  }

  /**
   * @param {import('../reader/reader-pane.js').ReaderPane} pane
   * @param {string} id
   * @param {{ at?: {x: number, y: number}, focus?: boolean }} [options]
   */
  open(pane, id, { at, focus = false } = {}) {
    const store = pane.book.annotations;
    const annotation = store.get(id);
    if (!annotation) return;
    const anchor = at ?? this.#anchorFor(pane, annotation);

    const comment = el('textarea', { rows: 4, placeholder: annotation.type === 'note' ? 'Write a note…' : 'Add a comment…' });
    comment.value = annotation.comment ?? '';
    // Comments save as you type; per-keystroke undo steps would be noise.
    comment.addEventListener('input', () => store.update(id, { comment: comment.value }, { undoable: false }));
    comment.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) this.close();
    });

    const swatches = el(
      'div',
      { class: 'swatches' },
      PALETTE.map((color) =>
        el('button', {
          class: `swatch${color.toLowerCase() === annotation.color?.toLowerCase() ? ' active' : ''}`,
          style: { background: color },
          title: color,
          onclick: () => {
            store.update(id, { color });
            this.open(pane, id, { at: anchor });
          },
        }),
      ),
    );

    const quote = annotation.textQuoted;
    this.el.replaceChildren(
      el('div', { class: 'pop-head' }, [
        el('strong', { text: ANNOTATION_LABELS[annotation.type] }),
        el('span', { class: 'muted', text: `p. ${pane.book.pageLabel(annotation.page)}` }),
        el('span', { class: 'spacer' }),
        el('button', {
          class: 'icon-btn danger',
          title: 'Delete (undo with ⌘/Ctrl+Z)',
          html: icon('trash', 16),
          onclick: () => {
            store.remove(id);
            this.close();
          },
        }),
        el('button', { class: 'icon-btn', title: 'Close', html: icon('x', 16), onclick: () => this.close() }),
      ]),
      quote ? el('blockquote', { text: quote.length > QUOTE_PREVIEW_CHARS ? `${quote.slice(0, QUOTE_PREVIEW_CHARS)}…` : quote }) : null,
      swatches,
      comment,
    );
    this.el.hidden = false;
    placeFloating(this.el, anchor.x, anchor.y, { gap: 12 });
    if (focus) comment.focus();
  }

  close() {
    this.el.hidden = true;
  }

  #anchorFor(pane, annotation) {
    const node = pane.pageViews.get(annotation.page)?.overlayGroup.querySelector(`[data-id="${annotation.id}"]`);
    if (node?.isConnected) {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  }
}
