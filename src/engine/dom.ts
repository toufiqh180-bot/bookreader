/**
 * Tiny DOM helpers for the reader engine. The engine builds pages with plain
 * DOM (not React) because it manages thousands of canvases and layers whose
 * lifetimes are tied to scrolling, not to component state.
 */

interface Attrs {
  class?: string;
  text?: string;
  dataset?: Record<string, string>;
  /** Any other attribute; `null`/`false` skip it, `true` sets it empty. */
  [attribute: string]: string | number | boolean | null | undefined | Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Array<Node | string | null> = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value as Record<string, string>);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child != null) node.append(child);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | null | undefined> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value));
  return node;
}
