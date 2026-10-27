/**
 * Tiny DOM construction helpers. The app uses plain DOM — no framework — so
 * these keep view code declarative and short.
 */

export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Creates an element.
 *   el('button', { class: 'btn', title: 'Save', onclick: save }, ['Save'])
 * Attribute keys: `class`, `text`, `html`, `style` (object), `on<event>`,
 * `dataset` (object); anything else becomes an attribute. `null`/`false`
 * values are skipped, `true` sets an empty attribute.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child != null && child !== false) node.append(child);
  return node;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, value);
  return node;
}

/** True when keyboard input is going into a text field. */
export function isEditable(target) {
  return Boolean(target) && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Positions a floating element near (x, y), keeping it fully on screen. */
export function placeFloating(node, x, y, { gap = 10, prefer = 'below' } = {}) {
  const { offsetWidth: w, offsetHeight: h } = node;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2));
  const fitsBelow = y + gap + h < window.innerHeight - 8;
  const fitsAbove = y - gap - h > 8;
  const top = (prefer === 'below' && fitsBelow) || !fitsAbove ? Math.min(y + gap, window.innerHeight - h - 8) : y - gap - h;
  node.style.left = `${left}px`;
  node.style.top = `${Math.max(8, top)}px`;
}
