/**
 * React access to the AppController. Components read state with
 * `useAppState()` and act with `useCommand()` — they never mutate the
 * controller's internals directly.
 */
import { createContext, useCallback, useContext, useEffect, useReducer, useSyncExternalStore } from 'react';
import type { AppController, ViewState } from '../app/app-controller.ts';
import type { Emitter } from '../lib/util.ts';

export const AppContext = createContext<AppController | null>(null);

export function useApp(): AppController {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside <AppContext.Provider>');
  return app;
}

/** The current ViewState; re-renders when it changes. */
export function useAppState(): ViewState {
  const app = useApp();
  return useSyncExternalStore(app.subscribe, app.getSnapshot);
}

/** Returns `run(commandId, arg?)`. */
export function useCommand(): (command: string, arg?: unknown) => unknown {
  const app = useApp();
  return useCallback((command: string, arg?: unknown) => app.commands.run(command, arg), [app]);
}

/**
 * Re-renders whenever `emitter` fires `event` — for components that render
 * data owned by a model store (annotations, bookmarks, search results).
 */
export function useEmitter<E extends Record<string, unknown[]>>(emitter: Emitter<E> | null | undefined, ...events: Array<keyof E>): void {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!emitter) return;
    const offs = events.map((event) => emitter.on(event, rerender as never));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- events are literals
  }, [emitter]);
}
