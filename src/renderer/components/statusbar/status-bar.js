/**
 * Bottom bar: reading progress, page position, and auto-scroll controls
 * while auto-scroll is running.
 */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { MIN_SPEED, MAX_SPEED } from '../reader/auto-scroller.js';

export class StatusBar {
  /**
   * @param {HTMLElement} root
   * @param {{ run: (command: string, arg?: any) => void }} deps
   */
  constructor(root, { run }) {
    this.run = run;
    this.progressFill = el('div', { class: 'progress-fill' });
    this.position = el('span', { class: 'status-position' });
    this.speedValue = el('span', { class: 'muted' });
    this.speed = el('input', { type: 'range', min: MIN_SPEED, max: MAX_SPEED, step: 5, 'aria-label': 'Auto-scroll speed' });
    this.speed.addEventListener('input', () => run('view.autoScrollSpeed', Number(this.speed.value)));
    this.pauseButton = el('button', { class: 'icon-btn small', onclick: () => run('view.toggleAutoScrollPause') });
    this.autoScroll = el('div', { class: 'status-autoscroll' }, [
      el('span', { text: 'Auto-scroll' }),
      this.pauseButton,
      this.speed,
      this.speedValue,
      el('button', { class: 'icon-btn small', title: 'Stop (Esc)', html: icon('x', 14), onclick: () => run('view.toggleAutoScroll') }),
    ]);
    root.append(el('div', { class: 'progress', role: 'progressbar' }, [this.progressFill]), this.position, el('span', { class: 'spacer' }), this.autoScroll);
    this.root = root;
  }

  /** @param {import('../../app/app.js').ViewState} state */
  update(state) {
    this.root.hidden = !state.hasBook;
    if (!state.hasBook) return;
    const fraction = state.pageCount > 1 ? (state.page - 1) / (state.pageCount - 1) : 1;
    this.progressFill.style.width = `${(fraction * 100).toFixed(2)}%`;
    this.position.textContent = `Page ${state.pageLabel} of ${state.pageCount} · ${Math.round(fraction * 100)}%`;

    const { active, paused, speed } = state.autoScroll;
    this.autoScroll.hidden = !active;
    if (active) {
      this.pauseButton.innerHTML = icon(paused ? 'play' : 'pause', 14);
      this.pauseButton.title = paused ? 'Resume (Space)' : 'Pause (Space)';
      if (document.activeElement !== this.speed) this.speed.value = speed;
      this.speedValue.textContent = `${speed} px/s`;
    }
  }
}
