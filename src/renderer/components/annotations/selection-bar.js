/**
 * Floating toolbar shown above selected text (select tool only):
 * highlight colours, underline, squiggly, strikethrough, note, copy, link,
 * search.
 */
import { el, placeFloating } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { PALETTE } from '../../app/tool-state.js';
import { selectedText } from './text-selection.js';

const QUICK_COLORS = PALETTE.slice(0, 5);
const SETTLE_DELAY_MS = 120;

export class SelectionBar {
  /**
   * @param {{
   *   getPane: () => import('../reader/reader-pane.js').ReaderPane | null,
   *   isSelectTool: () => boolean,
   *   actions: {
   *     markup: (pane, type: string, color?: string) => void,
   *     note: (pane) => void,
   *     copy: () => void,
   *     copyLink: () => void,
   *     search: (text: string) => void,
   *   },
   * }} deps
   */
  constructor({ getPane, isSelectTool, actions }) {
    this.getPane = getPane;
    this.isSelectTool = isSelectTool;
    this.actions = actions;
    this.el = el('div', { class: 'selection-bar', role: 'toolbar', hidden: true });
    document.body.append(this.el);

    let pointerDown = false;
    document.addEventListener('pointerdown', () => (pointerDown = true), true);
    document.addEventListener('pointerup', () => {
      pointerDown = false;
      this.#scheduleUpdate();
    });
    document.addEventListener('selectionchange', () => !pointerDown && this.#scheduleUpdate());
  }

  hide() {
    this.el.hidden = true;
  }

  #scheduleUpdate() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#update(), SETTLE_DELAY_MS);
  }

  #update() {
    const pane = this.getPane();
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.rangeCount;
    if (!pane || !hasSelection || !this.isSelectTool() || pane.reflow.active) return this.hide();
    const range = selection.getRangeAt(0);
    if (!pane.scroller.contains(range.commonAncestorContainer)) return this.hide();
    this.#show(pane, range.getBoundingClientRect());
  }

  #show(pane, rect) {
    const button = (iconName, title, run) => el('button', { class: 'icon-btn', title, html: icon(iconName, 16), onclick: run });
    const { markup, note, copy, copyLink, search } = this.actions;
    this.el.replaceChildren(
      ...QUICK_COLORS.map((color) =>
        el('button', { class: 'swatch', title: 'Highlight (H)', style: { background: color }, onclick: () => markup(pane, 'highlight', color) }),
      ),
      el('span', { class: 'sep' }),
      button('underline', 'Underline', () => markup(pane, 'underline')),
      button('squiggly', 'Squiggly underline', () => markup(pane, 'squiggly')),
      button('strike', 'Strikethrough', () => markup(pane, 'strikeout')),
      button('note', 'Add note (N)', () => note(pane)),
      el('span', { class: 'sep' }),
      button('copy', 'Copy text', copy),
      button('link', 'Copy link to this passage', copyLink),
      button('search', 'Search the book for this', () => search(selectedText())),
    );
    this.el.hidden = false;
    placeFloating(this.el, rect.left + rect.width / 2, rect.top, { prefer: 'above' });
  }
}
