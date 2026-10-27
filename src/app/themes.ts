/**
 * Reading themes. A theme is applied to a tab's element as `data-theme`;
 * reader.css maps it to a CSS filter on page canvases plus an optional
 * multiply-blended tint. Annotations sit above both, so their colours stay
 * true in every theme. `dark` themes also switch the app chrome to dark.
 */
export interface Theme {
  id: string;
  label: string;
  dark: boolean;
}

export const THEMES: Theme[] = [
  { id: 'light', label: 'Light', dark: false },
  { id: 'sepia', label: 'Sepia', dark: false },
  { id: 'dark', label: 'Dark', dark: true },
  { id: 'night', label: 'Night', dark: true },
  { id: 'mono', label: 'Mono', dark: false },
  { id: 'custom', label: 'Tint', dark: false },
];

/** The `T` shortcut cycles through these, per the shortcut spec. */
export const QUICK_CYCLE = ['light', 'sepia', 'dark'];

export const themeById = (id: string | null | undefined): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function nextQuickTheme(current: string): string {
  const index = QUICK_CYCLE.indexOf(current);
  return QUICK_CYCLE[(index + 1) % QUICK_CYCLE.length];
}

export function applyTheme(target: HTMLElement, themeId: string, tint: { color: string; brightness: number }): void {
  target.dataset.theme = themeById(themeId).id;
  target.style.setProperty('--custom-tint', tint.color);
  target.style.setProperty('--custom-brightness', String(tint.brightness));
}
