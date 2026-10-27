/**
 * The left sidebar: a tab strip plus one panel at a time. Panels are
 * created per book and re-rendered when the active tab changes.
 *
 * Panel contract:
 *   constructor(context)      context = { book, pane: () => ReaderPane, app }
 *   el                        root element
 *   onPageChange?(page)       current page changed
 *   onShow?()                 panel became visible
 *   destroy?()
 */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { OutlinePanel } from './outline-panel.js';
import { ThumbnailsPanel } from './thumbnails-panel.js';
import { NotesPanel } from './notes-panel.js';
import { BookmarksPanel } from './bookmarks-panel.js';
import { SearchPanel } from './search-panel.js';

export const SIDEBAR_PANELS = [
  { id: 'outline', icon: 'list', title: 'Contents', Panel: OutlinePanel },
  { id: 'thumbnails', icon: 'grid', title: 'Pages', Panel: ThumbnailsPanel },
  { id: 'notes', icon: 'notes', title: 'Notes', Panel: NotesPanel },
  { id: 'bookmarks', icon: 'bookmark', title: 'Bookmarks', Panel: BookmarksPanel },
  { id: 'search', icon: 'search', title: 'Search', Panel: SearchPanel },
];

export class Sidebar {
  /**
   * @param {HTMLElement} root
   * @param {{ initialPanel?: string, onPanelChange: (id: string) => void }} options
   */
  constructor(root, { initialPanel = 'outline', onPanelChange }) {
    this.root = root;
    this.panelId = SIDEBAR_PANELS.some((p) => p.id === initialPanel) ? initialPanel : 'outline';
    this.onPanelChange = onPanelChange;
    this.context = null;
    this.panel = null;

    this.tabs = el(
      'div',
      { class: 'side-tabs', role: 'tablist' },
      SIDEBAR_PANELS.map(({ id, icon: iconName, title }) =>
        el('button', {
          class: 'side-tab',
          role: 'tab',
          title,
          dataset: { panel: id },
          html: `${icon(iconName, 17)}<span>${title}</span>`,
          onclick: () => this.show(id),
        }),
      ),
    );
    this.body = el('div', { class: 'side-body' });
    root.append(this.tabs, this.body);
    this.#render();
  }

  /** Points the sidebar at a book (or null for the library screen). */
  setContext(context) {
    this.context = context;
    this.#render();
  }

  show(panelId) {
    this.panelId = panelId;
    this.onPanelChange(panelId);
    this.#render();
    this.panel?.onShow?.();
  }

  onPageChange(page) {
    this.panel?.onPageChange?.(page);
  }

  #render() {
    for (const tab of this.tabs.children) tab.classList.toggle('active', tab.dataset.panel === this.panelId);
    this.panel?.destroy?.();
    this.panel = null;
    if (!this.context) {
      this.body.replaceChildren(el('div', { class: 'empty', text: 'Open a book to see its contents.' }));
      return;
    }
    const { Panel } = SIDEBAR_PANELS.find((p) => p.id === this.panelId);
    this.panel = new Panel(this.context);
    this.body.replaceChildren(this.panel.el);
    this.panel.onPageChange?.(this.context.pane().currentPage);
  }
}
