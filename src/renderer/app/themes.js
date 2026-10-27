/**
 * Reading themes. Each theme is applied to a tab's element as `data-theme`;
 * styles.css maps it to a CSS filter on page canvases plus an optional
 * multiply-blended tint layer. Annotations sit above both, so their colours
 * stay true in every theme.
 *
 *   light   — the PDF as authored
 *   sepia   — warm paper (multiply tint)
 *   dark    — inverted with hue preserved, so images keep their colours
 *   night   — dark + amber tint, minimal blue light
 *   mono    — greyscale with extra contrast (faded scans)
 *   custom  — user tint colour and brightness
 */

export const THEMES = [
  { id: 'light', label: 'Light', chrome: 'light' },
  { id: 'sepia', label: 'Sepia', chrome: 'light' },
  { id: 'dark', label: 'Dark', chrome: 'dark' },
  { id: 'night', label: 'Night (warm)', chrome: 'dark' },
  { id: 'mono', label: 'Monochrome', chrome: 'light' },
  { id: 'custom', label: 'Custom tint', chrome: 'light' },
];

/** The `T` shortcut cycles through these, per the shortcut spec. */
export const QUICK_CYCLE = ['light', 'sepia', 'dark'];

export const DEFAULT_CUSTOM_TINT = { color: '#d8e8d0', brightness: 0.95 };

export function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function nextQuickTheme(current) {
  const index = QUICK_CYCLE.indexOf(current);
  return QUICK_CYCLE[(index + 1) % QUICK_CYCLE.length];
}

/**
 * @param {HTMLElement} target  element that receives data-theme
 * @param {string} themeId
 * @param {{ color: string, brightness: number }} customTint
 */
export function applyTheme(target, themeId, customTint = DEFAULT_CUSTOM_TINT) {
  target.dataset.theme = themeById(themeId).id;
  target.style.setProperty('--custom-tint', customTint.color);
  target.style.setProperty('--custom-brightness', String(customTint.brightness));
}
