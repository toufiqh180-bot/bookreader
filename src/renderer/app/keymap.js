/**
 * Keyboard shortcuts handled in the page. Shortcuts with modifiers that also
 * appear in the menu (⌘B, ⌘=, ⌘M, ⌘[ …) are registered as menu accelerators
 * in src/main/menu.js instead, so they show up in the menu bar.
 *
 * Single-letter shortcuts are ignored while typing in a text field.
 *
 * Each binding: [matcher, command, arg?]. The first match wins.
 */
import { isEditable } from '../components/common/dom.js';

const plain = (key) => (e) => e.key.toLowerCase() === key && !e.metaKey && !e.ctrlKey && !e.altKey;
const shift = (key) => (e) => e.key === key && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
const alt = (key) => (e) => e.key === key && e.altKey && !e.metaKey && !e.ctrlKey;

/** @type {Array<[(e: KeyboardEvent) => boolean, string, any?]>} */
export const KEY_BINDINGS = [
  // Reading
  [shift(' '), 'nav.previous'],
  [plain(' '), 'nav.spacebar'], // next page, or pause/resume while auto-scrolling
  [plain('pagedown'), 'nav.next'],
  [plain('pageup'), 'nav.previous'],
  [plain('arrowright'), 'nav.nextInPageMode'],
  [plain('arrowleft'), 'nav.previousInPageMode'],
  [plain('arrowup'), 'view.autoScrollFaster'],
  [plain('arrowdown'), 'view.autoScrollSlower'],
  [plain('home'), 'nav.firstPage'],
  [plain('end'), 'nav.lastPage'],
  // History: Alt+arrows on every platform (macOS also gets ⌘[ / ⌘] from the menu)
  [alt('ArrowLeft'), 'nav.back'],
  [alt('ArrowRight'), 'nav.forward'],
  // Annotations
  [plain('h'), 'annotate.highlight'],
  [plain('n'), 'annotate.note'],
  [plain('v'), 'tool.set', 'select'],
  [plain('u'), 'tool.set', 'underline'],
  [plain('s'), 'tool.set', 'strikeout'],
  [plain('p'), 'tool.set', 'pen'],
  [plain('m'), 'tool.set', 'marker'],
  [plain('e'), 'tool.set', 'eraser'],
  // Themes & misc
  [plain('t'), 'view.cycleTheme'],
  [plain('escape'), 'app.escape'],
];

/**
 * Commands bound to arrow keys only act in some states (e.g. ← flips pages
 * only in page mode); they return `false` to let the browser handle the key.
 *
 * @param {import('./command-registry.js').CommandRegistry} commands
 */
export function installKeymap(commands) {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (isEditable(event.target) && event.key !== 'Escape') return;
    for (const [matches, command, arg] of KEY_BINDINGS) {
      if (!matches(event)) continue;
      if (commands.run(command, arg) !== false) event.preventDefault();
      return;
    }
  });
}

/** Rows for the shortcuts help sheet: [action, Windows/Linux, macOS]. */
export const SHORTCUT_HELP = [
  ['Next page / scroll down', 'Space / PageDown', 'Space / PageDown'],
  ['Previous page / scroll up', 'Shift+Space / PageUp', 'Shift+Space / PageUp'],
  ['Back (history)', 'Alt+←', '⌘[  or  ⌥←'],
  ['Forward (history)', 'Alt+→', '⌘]  or  ⌥→'],
  ['Toggle sidebar', 'Ctrl+B', '⌘B'],
  ['Zoom in / out', 'Ctrl+= / Ctrl+-', '⌘= / ⌘-'],
  ['Fit page / fit width', 'Ctrl+0 / Ctrl+9', '⌘0 / ⌘9'],
  ['Continuous ⇄ page mode', 'Ctrl+M', '⌘M'],
  ['Two-page spread', 'Ctrl+2', '⌘2'],
  ['Reflow text view', 'Ctrl+R', '⌘R'],
  ['Smart margin crop', 'Ctrl+K', '⌘K'],
  ['Split screen', 'Ctrl+\\', '⌘\\'],
  ['Auto-scroll (Space pauses, ↑/↓ speed)', 'Ctrl+Shift+A', '⇧⌘A'],
  ['Highlight selected text', 'H', 'H'],
  ['Add sticky note (to selection)', 'N', 'N'],
  ['Cycle Light / Sepia / Dark theme', 'T', 'T'],
  ['Tools: select / underline / strike / pen / marker / eraser', 'V U S P M E', 'V U S P M E'],
  ['Find in book', 'Ctrl+F', '⌘F'],
  ['Go to page', 'Ctrl+G', '⌘G'],
  ['Toggle bookmark', 'Ctrl+D', '⌘D'],
  ['Copy link to this spot', 'Ctrl+Shift+C', '⇧⌘C'],
  ['Undo / redo annotation', 'Ctrl+Z / Ctrl+Shift+Z', '⌘Z / ⇧⌘Z'],
  ['Open / close tab', 'Ctrl+O / Ctrl+W', '⌘O / ⌘W'],
];
