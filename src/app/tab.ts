/**
 * One open book: its Book and one or two ReaderPanes (split screen shows the
 * same book twice — say, the index beside a chapter).
 */
import { ReaderPane, type PaneServices } from '../engine/reader-pane.ts';
import { el } from '../engine/dom.ts';
import type { Book } from '../models/book.ts';

let nextTabId = 1;

export class Tab {
  readonly id = nextTabId++;
  readonly book: Book;
  readonly el: HTMLDivElement;
  readonly panes: ReaderPane[] = [];
  activePane: ReaderPane;
  readonly #panesEl: HTMLDivElement;
  readonly #services: PaneServices;
  readonly #autoScrollSpeed: number;
  readonly #onPaneCreated: (pane: ReaderPane) => void;

  constructor(book: Book, services: PaneServices, options: { autoScrollSpeed: number; onPaneCreated: (pane: ReaderPane) => void }) {
    this.book = book;
    this.#services = services;
    this.#autoScrollSpeed = options.autoScrollSpeed;
    this.#onPaneCreated = options.onPaneCreated;
    this.#panesEl = el('div', { class: 'panes' });
    this.el = el('div', { class: 'tab-view', hidden: true }, [this.#panesEl]);
    this.activePane = this.#addPane(true);
  }

  get isSplit(): boolean {
    return this.panes.length > 1;
  }

  /** Lays out panes; call once the tab is in the DOM and visible. */
  mount(): void {
    for (const pane of this.panes) if (!pane.el.dataset.mode) pane.relayout();
  }

  toggleSplit(): void {
    if (this.isSplit) {
      this.panes.pop()!.destroy();
      this.#panesEl.querySelector('.pane-divider')?.remove();
      this.activePane = this.panes[0];
    } else {
      this.#panesEl.append(el('div', { class: 'pane-divider' }));
      const secondary = this.#addPane(false);
      secondary.relayout(this.activePane.currentPosition());
      this.activePane = secondary;
    }
    this.#markActive();
  }

  setActivePane(pane: ReaderPane): void {
    this.activePane = pane;
    this.#markActive();
  }

  #markActive(): void {
    for (const pane of this.panes) pane.el.classList.toggle('active', this.isSplit && pane === this.activePane);
  }

  #addPane(primary: boolean): ReaderPane {
    const pane = new ReaderPane(this.book, this.#services, { primary, autoScrollSpeed: this.#autoScrollSpeed });
    this.panes.push(pane);
    this.#panesEl.append(pane.el);
    this.#onPaneCreated(pane);
    return pane;
  }

  async close(): Promise<void> {
    this.panes.forEach((pane) => pane.destroy());
    this.el.remove();
    await this.book.close();
  }
}
