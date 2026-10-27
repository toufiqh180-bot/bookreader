/**
 * Transient UI: toasts, dropdown menus, anchored panels and a small prompt
 * dialog. Only one menu/panel is open at a time; it closes on outside click
 * or Escape.
 */
import { el, placeFloating } from './dom.js';

// ---- Toasts -----------------------------------------------------------------

let toastRoot = null;

/**
 * @param {string} message
 * @param {{ action?: { label: string, run: () => void }, duration?: number }} [options]
 * @returns {{ update: (message: string) => void, close: () => void }}
 */
export function toast(message, { action, duration = 3200 } = {}) {
  toastRoot ??= document.body.appendChild(el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const text = el('span', { text: message });
  const node = el('div', { class: 'toast' }, [text]);
  const close = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  };
  if (action) {
    node.append(el('button', { class: 'toast-action', text: action.label, onclick: () => (action.run(), close()) }));
  }
  toastRoot.append(node);
  if (duration > 0) setTimeout(close, action ? duration * 2 : duration);
  return { update: (m) => (text.textContent = m), close };
}

// ---- Floating layer (menus / panels) ------------------------------------------

let openFloating = null;

export function closeFloating() {
  openFloating?.remove();
  openFloating?.__anchor?.classList.remove('open');
  openFloating = null;
}

document.addEventListener('pointerdown', (e) => {
  if (openFloating && !openFloating.contains(e.target) && !openFloating.__anchor?.contains(e.target)) closeFloating();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openFloating) closeFloating();
});

function showFloating(node, anchor) {
  const wasOpen = openFloating?.__anchor === anchor;
  closeFloating();
  if (wasOpen) return null; // clicking the anchor again toggles it closed
  node.__anchor = anchor;
  anchor.classList.add('open');
  document.body.append(node);
  const r = anchor.getBoundingClientRect();
  placeFloating(node, r.left + r.width / 2, r.bottom, { gap: 6 });
  openFloating = node;
  return node;
}

/**
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {() => void} [run]
 * @property {boolean} [checked]
 * @property {boolean} [disabled]
 * @property {string} [hint]   e.g. a shortcut
 * @property {string} [icon]   raw SVG
 *
 * @param {HTMLElement} anchor
 * @param {Array<MenuItem|'-'>} items  '-' draws a separator
 */
export function showMenu(anchor, items) {
  const menu = el('div', { class: 'menu', role: 'menu' });
  for (const item of items) {
    if (item === '-') {
      menu.append(el('div', { class: 'menu-sep' }));
      continue;
    }
    menu.append(
      el(
        'button',
        {
          class: `menu-item${item.checked ? ' checked' : ''}`,
          role: 'menuitem',
          disabled: item.disabled,
          onclick: () => {
            closeFloating();
            item.run?.();
          },
        },
        [
          el('span', { class: 'menu-check', html: item.icon ?? (item.checked ? '✓' : '') }),
          el('span', { class: 'menu-label', text: item.label }),
          item.hint ? el('span', { class: 'menu-hint', text: item.hint }) : null,
        ],
      ),
    );
  }
  return showFloating(menu, anchor);
}

/** Opens an anchored panel with arbitrary content (settings popovers). */
export function showPanel(anchor, content, { className = '' } = {}) {
  return showFloating(el('div', { class: `panel ${className}` }, [content]), anchor);
}

// ---- Prompt dialog ------------------------------------------------------------

/**
 * Minimal modal text prompt.
 * @returns {Promise<string|null>} the entered value, or null if cancelled
 */
export function prompt({ title, placeholder = '', value = '', okLabel = 'OK' }) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', placeholder, value });
    const finish = (result) => {
      backdrop.remove();
      resolve(result);
    };
    const backdrop = el('div', { class: 'modal-backdrop', onpointerdown: (e) => e.target === backdrop && finish(null) }, [
      el('form', { class: 'modal', onsubmit: (e) => (e.preventDefault(), finish(input.value)) }, [
        el('h2', { text: title }),
        input,
        el('div', { class: 'modal-actions' }, [
          el('button', { type: 'button', class: 'text-btn', text: 'Cancel', onclick: () => finish(null) }),
          el('button', { type: 'submit', class: 'primary-btn', text: okLabel }),
        ]),
      ]),
    ]);
    backdrop.addEventListener('keydown', (e) => e.key === 'Escape' && finish(null));
    document.body.append(backdrop);
    input.focus();
    input.select();
  });
}
