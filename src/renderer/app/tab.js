/**
 * One open book in the tab strip: its Book and one or two ReaderPanes
 * (split-screen shows the same book twice, e.g. an index beside a chapter).
 */
import { ReaderPane } from '../components/reader/reader-pane.js';
import { el } from '../components/common/dom.js';

let nextTabId = 1;

export class Tab {
  /**
   * @param {import('../models/book.js').Book} book
   * @param {import('../components/reader/reader-pane.js').PaneServices} services  shared by both panes
   * @param {{ autoScrollSpeed?: number }} paneOptions
   */
  constructor(book, services, paneOptions) {
    this.id = nextTabId++;
    this.book = book;
    this.services = services;
    this.paneOptions = paneOptions;
    this.panesEl = el('div', { class: 'panes' });
    this.el = el('div', { class: 'tab-view', hidden: true }, [this.panesEl]);
    /** @type {ReaderPane[]} */
    this.panes = [];
    this.activePane = this.#addPane({ primary: true });
  }

  get isSplit() {
    return this.panes.length > 1;
  }

  /** Lays out panes; must run after the tab element is in the DOM and visible. */
  mount() {
    for (const pane of this.panes) if (!pane.layout) pane.relayout();
  }

  toggleSplit() {
    if (this.isSplit) {
      const [, secondary] = this.panes;
      secondary.destroy();
      this.panes.pop();
      this.panesEl.querySelector('.pane-divider')?.remove();
      this.activePane = this.panes[0];
    } else {
      this.panesEl.append(el('div', { class: 'pane-divider' }));
      const secondary = this.#addPane({ primary: false });
      secondary.relayout();
      this.activePane = secondary;
    }
    this.panes.forEach((pane) => pane.el.classList.toggle('active', this.isSplit && pane === this.activePane));
  }

  setActivePane(pane) {
    this.activePane = pane;
    this.panes.forEach((p) => p.el.classList.toggle('active', this.isSplit && p === pane));
  }

  #addPane({ primary }) {
    const pane = new ReaderPane(this.book, this.services, { primary, ...this.paneOptions });
    this.panes.push(pane);
    this.panesEl.append(pane.el);
    return pane;
  }

  async close() {
    this.panes.forEach((pane) => pane.destroy());
    this.el.remove();
    await this.book.close();
  }
}
