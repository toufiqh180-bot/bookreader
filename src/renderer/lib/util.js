/**
 * Small, dependency-free helpers shared across the renderer. Nothing in here
 * touches the DOM, so it can be imported from unit tests running in Node.
 */

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Short unique id with a readable prefix, e.g. `annot-lk3j9x2a8c`. */
export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** ISO-8601 timestamp without milliseconds, e.g. `2026-10-27T06:00:00Z`. */
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Resolves on the next macrotask so long loops keep the UI responsive. */
export const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

export const median = (values) => percentile(values, 0.5);

/** Nearest-rank percentile of `values` (p in [0, 1]); 0 for an empty list. */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1)];
}

/**
 * Debounces `fn`. The returned function also has `flush()`, which runs the
 * pending call immediately (used to save state before a tab closes).
 */
export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    return fn(...args);
  };
  return debounced;
}

export function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, (c) => entities[c]);
}

/** Minimal typed-event emitter. `on` returns an unsubscribe function. */
export class Emitter {
  #handlers = new Map();

  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(handler);
    return () => this.#handlers.get(event)?.delete(handler);
  }

  emit(event, ...args) {
    for (const handler of this.#handlers.get(event) ?? []) handler(...args);
  }
}
