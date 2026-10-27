/**
 * Maps command ids ("view.zoomIn", "nav.back", …) to handlers. The menu, the
 * toolbar, the keymap and the selection bar all dispatch through here, so
 * each action is implemented exactly once.
 */
export class CommandRegistry {
  #handlers = new Map();

  /** @param {Record<string, (arg?: any) => unknown>} handlers */
  registerAll(handlers) {
    for (const [id, handler] of Object.entries(handlers)) this.#handlers.set(id, handler);
  }

  has(id) {
    return this.#handlers.has(id);
  }

  run(id, arg) {
    const handler = this.#handlers.get(id);
    if (!handler) {
      console.warn(`Unknown command: ${id}`);
      return undefined;
    }
    try {
      const result = handler(arg);
      if (result instanceof Promise) result.catch((error) => console.error(`Command ${id} failed`, error));
      return result;
    } catch (error) {
      console.error(`Command ${id} failed`, error);
      return undefined;
    }
  }
}
