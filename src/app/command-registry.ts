/**
 * Maps command ids ("view.zoomIn", "nav.back", …) to handlers. Menus, toolbar
 * buttons, keyboard shortcuts and the selection bar all dispatch ids, so each
 * action is implemented exactly once (see commands.ts).
 *
 * A handler may return `false` to say "not handled" — the keymap then lets the
 * browser handle the key (e.g. arrow keys outside page mode).
 */
/** Any handler; its argument type is checked where the command is dispatched. */
export type CommandHandler = (arg: never) => unknown;

export class CommandRegistry {
  readonly #handlers = new Map<string, (arg?: unknown) => unknown>();

  register(handlers: Record<string, CommandHandler>): void {
    for (const [id, handler] of Object.entries(handlers)) this.#handlers.set(id, handler as (arg?: unknown) => unknown);
  }

  run(id: string, arg?: unknown): unknown {
    const handler = this.#handlers.get(id);
    if (!handler) {
      console.warn(`Unknown command: ${id}`);
      return undefined;
    }
    try {
      const result = handler(arg);
      if (result instanceof Promise) result.catch((error: unknown) => console.error(`Command ${id} failed`, error));
      return result;
    } catch (error) {
      console.error(`Command ${id} failed`, error);
      return undefined;
    }
  }
}
