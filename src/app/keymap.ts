/**
 * Keyboard shortcuts handled in the page. Shortcuts with modifiers (⌘B, ⌘=,
 * ⌘M, ⌘[ …) are bound here when `includeMenuShortcuts` is set, which is
 * the case on the web and in the desktop app (neither has a native menu bar).
 *
 * Single-letter shortcuts are ignored while typing in a text field.
 */
import type { CommandRegistry } from './command-registry.ts';

type Matcher = (e: KeyboardEvent) => boolean;
type Binding = [Matcher, string, unknown?];

const plain =
  (key: string): Matcher =>
  (e) =>
    e.key.toLowerCase() === key && !e.metaKey && !e.ctrlKey && !e.altKey;
const shift =
  (key: string): Matcher =>
  (e) =>
    e.key === key && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
const alt =
  (key: string): Matcher =>
  (e) =>
    e.key === key && e.altKey && !e.metaKey && !e.ctrlKey;
/** ⌘ on Apple devices, Ctrl elsewhere. */
const mod =
  (key: string, { withShift = false } = {}): Matcher =>
  (e) =>
    (e.metaKey || e.ctrlKey) && !e.altKey && e.shiftKey === withShift && e.key.toLowerCase() === key;

const READING_KEYS: Binding[] = [
  [shift(' '), 'nav.previous'],
  [plain(' '), 'nav.spacebar'], // next page, or pause/resume auto-scroll
  [plain('pagedown'), 'nav.next'],
  [plain('pageup'), 'nav.previous'],
  [plain('arrowright'), 'nav.nextInPageMode'],
  [plain('arrowleft'), 'nav.previousInPageMode'],
  [plain('arrowup'), 'view.autoScrollFaster'],
  [plain('arrowdown'), 'view.autoScrollSlower'],
  [plain('home'), 'nav.firstPage'],
  [plain('end'), 'nav.lastPage'],
  [alt('ArrowLeft'), 'nav.back'],
  [alt('ArrowRight'), 'nav.forward'],
  [plain('h'), 'annotate.highlight'],
  [plain('n'), 'annotate.note'],
  [plain('v'), 'tool.set', 'select'],
  [plain('u'), 'tool.set', 'underline'],
  [plain('s'), 'tool.set', 'strikeout'],
  [plain('p'), 'tool.set', 'pen'],
  [plain('m'), 'tool.set', 'marker'],
  [plain('e'), 'tool.set', 'eraser'],
  [plain('t'), 'view.cycleTheme'],
  [plain('escape'), 'app.escape'],
];

/** Mirrors the desktop menu accelerators for the web build. */
const MENU_KEYS: Binding[] = [
  [mod('o'), 'file.open'],
  [mod('w'), 'file.closeTab'],
  [mod('z'), 'edit.undo'],
  [mod('z', { withShift: true }), 'edit.redo'],
  [mod('f'), 'nav.find'],
  [mod('g'), 'nav.goToPage'],
  [mod('d'), 'nav.toggleBookmark'],
  [mod('b'), 'view.toggleSidebar'],
  [mod('='), 'view.zoomIn'],
  [mod('+'), 'view.zoomIn'],
  [mod('-'), 'view.zoomOut'],
  [mod('0'), 'view.fitPage'],
  [mod('9'), 'view.fitWidth'],
  [mod('m'), 'view.toggleMode'],
  [mod('r'), 'view.toggleReflow'],
  [mod('k'), 'view.toggleCrop'],
  [mod('['), 'nav.back'],
  [mod(']'), 'nav.forward'],
  [mod('/'), 'help.shortcuts'],
];

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el) && (el!.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el!.tagName));
}

export function installKeymap(commands: CommandRegistry, { includeMenuShortcuts }: { includeMenuShortcuts: boolean }): () => void {
  const bindings = includeMenuShortcuts ? [...MENU_KEYS, ...READING_KEYS] : READING_KEYS;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (isEditable(event.target) && event.key !== 'Escape') return;
    // Let open dialogs and menus handle their own keys.
    if ((event.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"]')) return;
    for (const [matches, command, arg] of bindings) {
      if (!matches(event)) continue;
      if (commands.run(command, arg) !== false) event.preventDefault();
      return;
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

/** Rows for the shortcuts sheet: [action, Windows/Linux, macOS]. */
export const SHORTCUT_HELP: Array<[string, string, string]> = [
  ['Next / previous page', 'Space · Shift+Space', 'Space · ⇧Space'],
  ['Back / forward (history)', 'Alt+← / Alt+→', '⌘[ / ⌘]'],
  ['Toggle side panel', 'Ctrl+B', '⌘B'],
  ['Zoom in / out', 'Ctrl+= / Ctrl+-', '⌘= / ⌘-'],
  ['Fit page / fit width', 'Ctrl+0 / Ctrl+9', '⌘0 / ⌘9'],
  ['Continuous ⇄ page mode', 'Ctrl+M', '⌘M'],
  ['Reflow text view', 'Ctrl+R', '⌘R'],
  ['Smart margin crop', 'Ctrl+K', '⌘K'],
  ['Auto-scroll (Space pauses, ↑/↓ speed)', 'Ctrl+Shift+A', '⇧⌘A'],
  ['Highlight selection', 'H', 'H'],
  ['Sticky note on selection', 'N', 'N'],
  ['Cycle light / sepia / dark', 'T', 'T'],
  ['Tools: select · underline · strike · pen · marker · eraser', 'V U S P M E', 'V U S P M E'],
  ['Find in book', 'Ctrl+F', '⌘F'],
  ['Go to page', 'Ctrl+G', '⌘G'],
  ['Bookmark page', 'Ctrl+D', '⌘D'],
  ['Undo / redo annotation', 'Ctrl+Z / Ctrl+Shift+Z', '⌘Z / ⇧⌘Z'],
  ['Open / close book', 'Ctrl+O / Ctrl+W', '⌘O / ⌘W'],
];
