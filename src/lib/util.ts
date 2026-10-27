/**
 * Small, dependency-free helpers. Nothing here touches the DOM, so it runs in
 * unit tests under plain Node.
 */

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Short unique id with a readable prefix, e.g. `annot-lk3j9x2a8c`. */
export const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** ISO-8601 timestamp without milliseconds, e.g. `2026-10-27T06:00:00Z`. */
export const nowIso = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Resolves on the next macrotask so long loops keep the UI responsive. */
export const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Nearest-rank percentile of `values` (p in [0, 1]); 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1)];
}

export const median = (values: number[]): number => percentile(values, 0.5);

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Runs any pending call immediately (e.g. to save before closing). */
  flush(...args: A): unknown;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => unknown, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as Debounced<A>;
  debounced.flush = (...args: A) => {
    clearTimeout(timer);
    return fn(...args);
  };
  return debounced;
}

export function escapeHtml(text: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, (c) => entities[c]);
}

/**
 * Minimal typed event emitter. `Events` maps event names to argument tuples:
 *   class Store extends Emitter<{ change: [page: number] }> {}
 * `on` returns an unsubscribe function.
 */
export class Emitter<Events extends Record<string, unknown[]>> {
  // Handlers are stored untyped; `on`/`emit` keep each event's signature.
  #handlers = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<E extends keyof Events>(event: E, handler: (...args: Events[E]) => void): () => void {
    const untyped = handler as unknown as (...args: unknown[]) => void;
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event)!.add(untyped);
    return () => {
      this.#handlers.get(event)?.delete(untyped);
    };
  }

  emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const handler of this.#handlers.get(event) ?? []) handler(...args);
  }
}

export const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

export const fileBaseName = (name: string): string => name.replace(/\.pdf$/i, '');
