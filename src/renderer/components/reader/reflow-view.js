/**
 * Reflow view: the book's text re-flowed into one responsive column (like an
 * EPUB) with adjustable typography. Paragraphs are reconstructed by
 * lib/reflow-text.js. Pages near the reader are filled first so the view is
 * usable immediately; the rest fills in the background.
 */
import { linesFromPageText, paragraphsFromLines } from '../../lib/reflow-text.js';
import { escapeHtml, yieldToUi } from '../../lib/util.js';
import { el } from '../common/dom.js';

export const REFLOW_FONTS = {
  serif: { label: 'Serif', stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  sans: { label: 'Sans-serif', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  readable: { label: 'High legibility', stack: 'Verdana, Tahoma, "DejaVu Sans", sans-serif' },
  mono: { label: 'Monospace', stack: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
};

export const DEFAULT_REFLOW_SETTINGS = { font: 'serif', size: 19, lineHeight: 1.65, width: 680, align: 'left' };

const PAGES_FILLED_UPFRONT = 6;

export class ReflowView {
  /**
   * @param {import('../../models/book.js').Book} book
   * @param {{ onPageChange: (page: number) => void, onShowPage: (page: number) => void }} callbacks
   */
  constructor(book, { onPageChange, onShowPage }) {
    this.book = book;
    this.onPageChange = onPageChange;
    this.onShowPage = onShowPage;
    this.active = false;
    this.generation = 0; // bumps on invalidate() to cancel background filling
    this.sections = [];
    this.article = el('article', { class: 'reflow-article' });
    this.scroller = el('div', { class: 'reflow-scroller', tabindex: '0' }, [this.article]);
    this.el = el('div', { class: 'reflow', hidden: true }, [this.scroller]);
    this.scroller.addEventListener('scroll', () => this.#reportPage(), { passive: true });
  }

  /** @param {typeof DEFAULT_REFLOW_SETTINGS} settings */
  applySettings(settings) {
    Object.assign(this.article.style, {
      fontFamily: (REFLOW_FONTS[settings.font] ?? REFLOW_FONTS.serif).stack,
      fontSize: `${settings.size}px`,
      lineHeight: String(settings.lineHeight),
      maxWidth: `${settings.width}px`,
      textAlign: settings.align,
    });
  }

  async open(page) {
    this.active = true;
    this.el.hidden = false;
    if (!this.sections.length) await this.#build(page);
    this.scrollToPage(page);
    this.scroller.focus({ preventScroll: true });
  }

  close() {
    this.active = false;
    this.el.hidden = true;
  }

  /** Call after OCR adds text so the view rebuilds next time it opens. */
  invalidate() {
    this.generation++;
    this.sections = [];
    this.article.replaceChildren();
  }

  scrollToPage(page) {
    const section = this.sections[page - 1];
    if (section) this.scroller.scrollTop = section.offsetTop - 16;
  }

  pageDown() {
    this.scroller.scrollBy({ top: this.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  pageUp() {
    this.scroller.scrollBy({ top: -this.scroller.clientHeight * 0.9, behavior: 'smooth' });
  }

  async #build(startPage) {
    const generation = this.generation;
    this.sections = [];
    for (let page = 1; page <= this.book.numPages; page++) {
      const marker = el('button', { class: 'reflow-marker', text: `Page ${this.book.pageLabel(page)}`, title: 'Show this page in the PDF', onclick: () => this.onShowPage(page) });
      this.sections.push(el('section', { class: 'reflow-page', dataset: { page } }, [marker]));
    }
    this.article.replaceChildren(...this.sections);

    const order = fillOrder(startPage, this.book.numPages);
    for (const page of order.slice(0, PAGES_FILLED_UPFRONT)) await this.#fill(page);
    (async () => {
      for (const [i, page] of order.slice(PAGES_FILLED_UPFRONT).entries()) {
        if (generation !== this.generation) return;
        await this.#fill(page);
        if (i % 8 === 0) await yieldToUi();
      }
    })();
  }

  async #fill(page) {
    const section = this.sections[page - 1];
    const text = await this.book.readableText(page);
    const paragraphs = paragraphsFromLines(linesFromPageText(text), this.book.pageSize(page).h);
    // Content added above the reader would push the text down; compensate.
    const above = section.offsetTop < this.scroller.scrollTop;
    const heightBefore = section.offsetHeight;
    if (paragraphs.length) {
      section.insertAdjacentHTML('beforeend', paragraphs.map((p) => (p.heading ? `<h3>${escapeHtml(p.text)}</h3>` : `<p>${escapeHtml(p.text)}</p>`)).join(''));
    } else {
      section.append(el('p', { class: 'reflow-empty', html: 'No text on this page. If it is a scanned image, use <b>Tools → Recognize Text (OCR)</b>.' }));
    }
    if (above) this.scroller.scrollTop += section.offsetHeight - heightBefore;
  }

  #reportPage() {
    if (!this.active || !this.sections.length) return;
    const y = this.scroller.scrollTop + this.scroller.clientHeight * 0.25;
    // Binary search for the last section starting above y.
    let lo = 0;
    let hi = this.sections.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.sections[mid].offsetTop <= y) lo = mid;
      else hi = mid - 1;
    }
    this.onPageChange(lo + 1);
  }
}

/** Pages ordered by distance from `start`: start, start+1, start−1, start+2, … */
export function fillOrder(start, pageCount) {
  const order = [];
  for (let d = 0; order.length < pageCount; d++) {
    if (start + d <= pageCount) order.push(start + d);
    if (d > 0 && start - d >= 1) order.push(start - d);
  }
  return order;
}
