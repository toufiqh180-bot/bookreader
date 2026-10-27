import { useSyncExternalStore } from 'react';

/** True while a CSS media query matches. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
  );
}

/** Phones and narrow windows: rails collapse into a bottom bar and panels open as sheets. */
export const useCompactLayout = () => useMediaQuery('(max-width: 767px)');
