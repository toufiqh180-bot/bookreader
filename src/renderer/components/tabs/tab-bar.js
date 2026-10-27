/** The strip of open-book tabs across the top of the window. */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';

export class TabBar {
  /**
   * @param {HTMLElement} root
   * @param {{ onSelect: (tab) => void, onClose: (tab) => void, onNew: () => void }} handlers
   */
  constructor(root, { onSelect, onClose, onNew }) {
    this.list = el('div', { class: 'tabs', role: 'tablist' });
    root.append(this.list, el('button', { class: 'icon-btn new-tab', title: 'Open PDF (⌘/Ctrl+O)', html: icon('plus', 16), onclick: onNew }));
    this.onSelect = onSelect;
    this.onClose = onClose;
  }

  /**
   * @param {import('../../app/tab.js').Tab[]} tabs
   * @param {import('../../app/tab.js').Tab|null} active
   */
  render(tabs, active) {
    this.list.replaceChildren(
      ...tabs.map((tab) =>
        el(
          'div',
          {
            class: `tab${tab === active ? ' active' : ''}`,
            role: 'tab',
            'aria-selected': String(tab === active),
            title: tab.book.filePath,
            onmousedown: (e) => e.button === 1 && (e.preventDefault(), this.onClose(tab)), // middle-click closes
            onclick: () => this.onSelect(tab),
          },
          [
            el('span', { class: 'tab-title', text: tab.book.fileName.replace(/\.pdf$/i, '') }),
            el('button', {
              class: 'tab-close',
              title: 'Close tab (⌘/Ctrl+W)',
              html: icon('x', 12),
              onclick: (e) => {
                e.stopPropagation();
                this.onClose(tab);
              },
            }),
          ],
        ),
      ),
    );
  }
}
