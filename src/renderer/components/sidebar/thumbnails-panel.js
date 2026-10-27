/**
 * Grid of page thumbnails, rendered lazily as they scroll into view. Badges
 * show bookmarks and annotation counts. Widening the sidebar fits more
 * columns.
 */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';

const THUMB_WIDTH_PX = 160;
const PRELOAD_MARGIN = '400px';

export class ThumbnailsPanel {
  constructor({ book, pane }) {
    this.book = book;
    this.pane = pane;
    this.el = el('div', { class: 'thumb-grid' });
    this.observer = new IntersectionObserver((entries) => this.#renderVisible(entries), { rootMargin: PRELOAD_MARGIN });

    const annotationCounts = new Map();
    for (const a of book.annotations.items) annotationCounts.set(a.page, (annotationCounts.get(a.page) ?? 0) + 1);

    for (let n = 1; n <= book.numPages; n++) {
      const { w, h } = book.pageSize(n);
      const count = annotationCounts.get(n);
      const thumb = el(
        'button',
        { class: 'thumb', title: `Page ${book.pageLabel(n)}`, dataset: { page: n }, onclick: () => this.pane().navigate({ page: n }) },
        [
          el('div', { class: 'thumb-img', style: { aspectRatio: `${w} / ${h}` } }),
          el('div', { class: 'thumb-label' }, [
            el('span', { text: book.pageLabel(n) }),
            book.bookmarks.has(n) ? el('span', { class: 'thumb-mark', html: icon('bookmark', 11) }) : null,
            count ? el('span', { class: 'thumb-count', text: count }) : null,
          ]),
        ],
      );
      this.el.append(thumb);
      this.observer.observe(thumb);
    }
  }

  onPageChange(page) {
    this.el.querySelector('.thumb.current')?.classList.remove('current');
    const thumb = this.el.querySelector(`.thumb[data-page="${page}"]`);
    if (!thumb) return;
    thumb.classList.add('current');
    thumb.scrollIntoView({ block: 'nearest' });
  }

  async #renderVisible(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      this.observer.unobserve(entry.target);
      const page = await this.book.doc.getPage(Number(entry.target.dataset.page));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (THUMB_WIDTH_PX / base.width) * Math.min(2, window.devicePixelRatio || 1) });
      const canvas = el('canvas', { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise.catch(() => {});
      entry.target.querySelector('.thumb-img').replaceChildren(canvas);
    }
  }

  destroy() {
    this.observer.disconnect();
  }
}
