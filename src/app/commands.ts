/**
 * Every user action, by id. Toolbar
 * buttons, keyboard shortcuts and the selection bar all dispatch these ids.
 *
 * Handlers that only make sense with a book open are wrapped in `withPane`
 * and do nothing on the library screen.
 */
import { toast } from 'sonner';
import * as actions from './book-actions.ts';
import { nextQuickTheme } from './themes.ts';
import { clearSelection } from '../engine/annotations/text-selection.ts';
import { clamp, range } from '../lib/util.ts';
import type { AppController, PanelId } from './app-controller.ts';
import type { ReaderPane } from '../engine/reader-pane.ts';
import type { Book } from '../models/book.ts';
import type { ExportFormat } from '../lib/export-format.ts';
import type { MarkupType, ViewMode, ZoomMode } from '../models/types.ts';
import type { Tool } from '../engine/annotations/annotation-controller.ts';
import type { ReflowSettings } from '../engine/reflow-view.ts';
import type { PageTransition } from '../engine/layouts/page-turn.ts';

const ZOOM_STEP = 1.2;
const AUTOSCROLL_STEP = 1.25;
const REFLOW_FONT_RANGE = [12, 36] as const;

/** Accepts a page number or a printed label ("xii"); null if neither matches. */
export function resolvePageInput(book: Book, input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  for (let n = 1; n <= book.numPages; n++) if (book.pageLabel(n) === text) return n;
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? clamp(number, 1, book.numPages) : null;
}

export function registerCommands(app: AppController): void {
  const { platform, commands } = app;
  const withPane =
    <A>(fn: (pane: ReaderPane, arg: A) => unknown) =>
    (arg?: A) =>
      app.activePane ? fn(app.activePane, arg as A) : undefined;

  const setAutoScrollSpeed = (pane: ReaderPane, speed: number) => {
    pane.autoScroller.setSpeed(speed);
    app.prefs.set('autoScrollSpeed', pane.autoScroller.speed);
  };
  const stepReflowFont = (delta: number) => app.setReflowSettings({ size: clamp(app.reflowSettings().size + delta, ...REFLOW_FONT_RANGE) });

  commands.register({
    // ---- File ----
    'file.open': async () => app.openSources(await platform.pickPdfFiles()),
    'file.library': () => app.showLibrary(),
    'file.closeTab': () => app.closeTab(),

    // ---- Edit ----
    'edit.undo': () => undoRedo(app, 'undo'),
    'edit.redo': () => undoRedo(app, 'redo'),

    // ---- Export & tools ----
    'export.annotations': (format: ExportFormat) => app.activeBook && actions.exportAnnotations(platform, app.activeBook, format),
    'export.flattened': () => app.activeBook && actions.exportPdf(platform, app.activeBook, { annotations: true }),
    'export.searchable': () => app.activeBook && actions.exportPdf(platform, app.activeBook, { annotations: false, ocr: true }),
    'tools.ocr': withPane((pane, scope: 'page' | 'all') => actions.runOcr(pane.book, scope === 'all' ? range(1, pane.book.numPages) : [pane.currentPage])),
    'tools.recomputeCrop': withPane(async (pane) => {
      if (await actions.ensureCrop(pane.book, { force: true })) app.activeTab!.panes.forEach((p) => p.setCrop(true));
    }),

    // ---- Navigation ----
    'nav.next': withPane((pane) => pane.next()),
    'nav.previous': withPane((pane) => pane.previous()),
    'nav.spacebar': withPane((pane) => (pane.autoScroller.active ? pane.autoScroller.togglePause() : pane.next())),
    'nav.nextInPageMode': withPane((pane) => (pane.isPaged && !pane.reflow.active ? pane.next() : false)),
    'nav.previousInPageMode': withPane((pane) => (pane.isPaged && !pane.reflow.active ? pane.previous() : false)),
    'nav.firstPage': withPane((pane) => pane.navigate({ page: 1 })),
    'nav.lastPage': withPane((pane) => pane.navigate({ page: pane.book.numPages })),
    'nav.back': withPane((pane) => pane.back()),
    'nav.forward': withPane((pane) => pane.forward()),
    'nav.goTo': withPane((pane, input: string) => {
      const page = resolvePageInput(pane.book, input);
      if (page) pane.navigate({ page });
      else if (input.trim()) toast.error(`There’s no page “${input}”.`);
      app.notify();
    }),
    'nav.goToPage': () => document.querySelector<HTMLInputElement>('[data-page-input]')?.focus(),
    'nav.find': () => app.activeBook && app.setSidebar(true, 'search'),
    'nav.toggleBookmark': withPane(async (pane) => {
      const { book, currentPage: page } = pane;
      if (book.bookmarks.has(page)) {
        book.bookmarks.removeOnPage(page);
        toast(`Bookmark on page ${book.pageLabel(page)} removed`);
      } else {
        const title = (await book.doc.sectionTitleFor(page)) ?? `Page ${book.pageLabel(page)}`;
        book.bookmarks.add(page, title);
        toast.success(`Bookmarked: ${title}`);
      }
    }),
    'nav.copyLink': withPane((pane) => actions.copyDeepLink(platform, pane)),

    // ---- View ----
    'view.toggleSidebar': () => app.setSidebar(!app.sidebarOpen),
    'view.panel': (panel: PanelId) => app.setSidebar(!(app.sidebarOpen && app.sidebarPanel === panel), panel),
    // In reflow view, zoom changes the text size instead of the page scale.
    'view.zoomIn': withPane((pane) => (pane.reflow.active ? stepReflowFont(1) : pane.zoomBy(ZOOM_STEP))),
    'view.zoomOut': withPane((pane) => (pane.reflow.active ? stepReflowFont(-1) : pane.zoomBy(1 / ZOOM_STEP))),
    'view.zoomTo': withPane((pane, scale: number) => pane.setZoom('custom', scale)),
    'view.zoomMode': withPane((pane, mode: ZoomMode) => pane.setZoom(mode)),
    'view.fitPage': withPane((pane) => pane.setZoom('fit-page')),
    'view.fitWidth': withPane((pane) => pane.setZoom('fit-width')),
    'view.mode': withPane((pane, mode: ViewMode) => pane.setMode(mode)),
    'view.toggleMode': withPane((pane) => pane.toggleMode()),
    'view.toggleReflow': withPane((pane) => pane.setReflow(!pane.reflow.active)),
    'view.reflowSettings': (patch: Partial<ReflowSettings>) => app.setReflowSettings(patch),
    'view.toggleCrop': withPane(async (pane) => {
      const enable = !pane.cropEnabled;
      if (enable && !(await actions.ensureCrop(pane.book))) return;
      app.activeTab!.panes.forEach((p) => p.setCrop(enable));
    }),
    'view.toggleSplitSpreads': withPane((pane) => app.activeTab!.panes.forEach((p) => p.setSplitSpreads(!pane.splitSpreads))),
    'view.toggleSplit': () => {
      app.activeTab?.toggleSplit();
      app.notify();
    },
    'view.theme': (themeId: string) => app.setTheme(themeId),
    'view.cycleTheme': () => app.activeBook && app.setTheme(nextQuickTheme(app.themeOf(app.activeBook))),
    'view.customTint': (tint: { color: string; brightness: number }) => {
      app.prefs.set('customTint', tint);
      app.setTheme('custom');
    },
    'view.pageTransition': (style: PageTransition) => app.prefs.set('pageTransition', style),
    'view.toggleAutoScroll': withPane((pane) => pane.toggleAutoScroll()),
    'view.toggleAutoScrollPause': withPane((pane) => pane.autoScroller.togglePause()),
    'view.autoScrollSpeed': withPane((pane, speed: number) => setAutoScrollSpeed(pane, speed)),
    'view.autoScrollFaster': withPane((pane) => (pane.autoScroller.active ? setAutoScrollSpeed(pane, pane.autoScroller.speed * AUTOSCROLL_STEP) : false)),
    'view.autoScrollSlower': withPane((pane) => (pane.autoScroller.active ? setAutoScrollSpeed(pane, pane.autoScroller.speed / AUTOSCROLL_STEP) : false)),

    // ---- Annotation tools ----
    'tool.set': (tool: Tool) => app.tools.set(tool),
    'tool.color': (color: string) => app.tools.setColor(color),
    'tool.width': (width: number) => app.tools.setWidth(width),
    'annotate.markup': withPane((pane, { type, color }: { type: MarkupType; color?: string }) => app.annotations.applyMarkup(pane, type, color)),
    'annotate.highlight': withPane((pane) => {
      if (!app.annotations.applyMarkup(pane, 'highlight')) app.tools.set('highlight');
    }),
    'annotate.note': withPane((pane) => {
      if (!app.annotations.addNoteToSelection(pane)) app.tools.set('note');
    }),

    // ---- App ----
    'app.escape': () => {
      app.closeEditor();
      clearSelection();
      app.activePane?.autoScroller.stop();
      app.tools.set('select');
    },
    'help.shortcuts': () => app.setShortcutsOpen(true),
  });
}

/** Undo/redo applies to the text field being edited, otherwise to annotations. */
function undoRedo(app: AppController, kind: 'undo' | 'redo'): void {
  const active = document.activeElement as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
    document.execCommand(kind);
    return;
  }
  const store = app.activeBook?.annotations;
  if (store && !store[kind]()) toast(`Nothing to ${kind}`);
}
