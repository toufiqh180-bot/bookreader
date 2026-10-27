/**
 * AppController — the app's state and behaviour, independent of React.
 *
 * Owns the open tabs, preferences, the annotation tool, per-book search
 * sessions and the command table (commands.ts). React components subscribe
 * with `useAppState()` (hooks/use-app.ts), which reads an immutable
 * `ViewState` snapshot rebuilt by `notify()` whenever anything changes, and
 * act by dispatching command ids.
 *
 * Keeping this outside React means the reader engine, commands and keyboard
 * handling are plain TypeScript: easy to follow, and React only renders.
 */
import { toast } from 'sonner';
import { Book } from '../models/book.ts';
import { Tab } from './tab.ts';
import { CommandRegistry } from './command-registry.ts';
import { registerCommands } from './commands.ts';
import { installKeymap } from './keymap.ts';
import { ToolState } from './tool-state.ts';
import type { Preferences } from './preferences.ts';
import { applyTheme, themeById } from './themes.ts';
import * as actions from './book-actions.ts';
import { AnnotationController, type Tool } from '../engine/annotations/annotation-controller.ts';
import { drawPageOverlay, flashRects } from '../engine/annotations/annotation-renderer.ts';
import type { PaneServices, ReaderPane } from '../engine/reader-pane.ts';
import type { ReflowSettings } from '../engine/reflow-view.ts';
import { BookSearch } from '../services/book-search.ts';
import { looksLikeSpreadScan } from '../lib/page-slots.ts';
import { parseDeepLink, type DeepLink } from '../lib/deep-link.ts';
import { range, fileBaseName } from '../lib/util.ts';
import type { BookSource, OpenRequest, Platform } from '../platform/platform.ts';
import type { ViewMode, ZoomMode } from '../models/types.ts';

export type PanelId = 'outline' | 'thumbnails' | 'notes' | 'bookmarks' | 'search';

export interface EditTarget {
  pane: ReaderPane;
  annotationId: string;
  at?: { x: number; y: number };
}

/** Everything the UI renders from. Rebuilt (never mutated) on every change. */
export interface ViewState {
  tabs: Array<{ id: number; title: string }>;
  activeTabId: number | null;
  /** The book and pane the UI acts on, or null on the library screen. */
  book: Book | null;
  pane: ReaderPane | null;
  page: number;
  pageLabel: string;
  pageCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  bookmarked: boolean;
  mode: ViewMode;
  reflow: boolean;
  reflowSettings: ReflowSettings;
  zoomPercent: number;
  zoomMode: ZoomMode;
  theme: string;
  darkChrome: boolean;
  crop: boolean;
  splitScreen: boolean;
  splitSpreads: boolean;
  hasSpreads: boolean;
  autoScroll: { active: boolean; paused: boolean; speed: number };
  tool: Tool;
  toolColor: string;
  toolWidth: number;
  sidebar: { open: boolean; panel: PanelId };
  editing: EditTarget | null;
  /** Bumped when the stored library changes, so the library screen reloads. */
  libraryVersion: number;
  shortcutsOpen: boolean;
}

export class AppController {
  readonly platform: Platform;
  readonly prefs: Preferences;
  readonly tools: ToolState;
  readonly commands = new CommandRegistry();
  readonly annotations: AnnotationController;
  tabs: Tab[] = [];
  activeTab: Tab | null = null;
  sidebarOpen: boolean;
  sidebarPanel: PanelId;
  editing: EditTarget | null = null;
  shortcutsOpen = false;
  libraryVersion = 0;
  readonly #searches = new WeakMap<Book, BookSearch>();
  readonly #listeners = new Set<() => void>();
  #snapshot: ViewState;
  #workspace: HTMLElement | null = null;

  constructor(platform: Platform, prefs: Preferences) {
    this.platform = platform;
    this.prefs = prefs;
    this.tools = new ToolState(prefs);
    this.sidebarOpen = prefs.get('sidebarOpen');
    this.sidebarPanel = prefs.get('sidebarPanel') as PanelId;
    this.annotations = new AnnotationController(this.tools, { edit: (pane, id, at) => this.editAnnotation(pane, id, at) });
    this.#snapshot = this.#buildSnapshot();

    registerCommands(this);
    installKeymap(this.commands, { includeMenuShortcuts: !platform.hasAppMenu });
    this.tools.on('change', () => this.notify());
    prefs.on('change', () => this.notify());
    platform.onCommand((command, arg) => this.commands.run(command, arg));
    platform.onOpenRequest((request) => void this.handleOpenRequest(request));
  }

  // ---- Subscription (useSyncExternalStore) ------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): ViewState => this.#snapshot;

  /** Rebuilds the snapshot and re-renders subscribers. Cheap; call freely. */
  notify(): void {
    this.#snapshot = this.#buildSnapshot();
    const book = this.activeTab?.book;
    this.platform.setTitle(book ? `${fileBaseName(book.fileName)} — BookReader` : 'BookReader');
    for (const listener of this.#listeners) listener();
  }

  get activePane(): ReaderPane | null {
    return this.activeTab?.activePane ?? null;
  }

  get activeBook(): Book | null {
    return this.activeTab?.book ?? null;
  }

  themeOf(book: Book): string {
    return book.session.theme ?? this.prefs.get('theme');
  }

  reflowSettings(): ReflowSettings {
    return this.prefs.get('reflow');
  }

  #buildSnapshot(): ViewState {
    const pane = this.activePane;
    const tool = this.tools.current();
    const base = {
      tabs: this.tabs.map((t) => ({ id: t.id, title: fileBaseName(t.book.fileName) })),
      activeTabId: this.activeTab?.id ?? null,
      tool,
      toolColor: this.tools.colorFor(tool),
      toolWidth: this.tools.widthFor(tool),
      sidebar: { open: this.sidebarOpen, panel: this.sidebarPanel },
      editing: this.editing,
      libraryVersion: this.libraryVersion,
      shortcutsOpen: this.shortcutsOpen,
      reflowSettings: this.reflowSettings(),
    };
    if (!pane) {
      const theme = this.prefs.get('theme');
      return {
        ...base,
        book: null,
        pane: null,
        page: 0,
        pageLabel: '',
        pageCount: 0,
        canGoBack: false,
        canGoForward: false,
        bookmarked: false,
        mode: 'continuous',
        reflow: false,
        zoomPercent: 100,
        zoomMode: 'auto',
        theme,
        darkChrome: themeById(theme).dark,
        crop: false,
        splitScreen: false,
        splitSpreads: false,
        hasSpreads: false,
        autoScroll: { active: false, paused: false, speed: 60 },
      };
    }
    const { book } = pane;
    const theme = this.themeOf(book);
    return {
      ...base,
      book,
      pane,
      page: pane.currentPage,
      pageLabel: book.pageLabel(pane.currentPage),
      pageCount: book.numPages,
      canGoBack: book.history.canGoBack,
      canGoForward: book.history.canGoForward,
      bookmarked: book.bookmarks.has(pane.currentPage),
      mode: pane.mode,
      reflow: pane.reflow.active,
      zoomPercent: Math.round(pane.scale * 100),
      zoomMode: pane.zoomMode,
      theme,
      darkChrome: themeById(theme).dark,
      crop: pane.cropEnabled,
      splitScreen: this.activeTab!.isSplit,
      splitSpreads: pane.splitSpreads,
      hasSpreads: book.pageSizes.some((s) => s.w / s.h > 1.2),
      autoScroll: { active: pane.autoScroller.active, paused: pane.autoScroller.paused, speed: pane.autoScroller.speed },
    };
  }

  // ---- Workspace & tabs ---------------------------------------------------------

  /** The element tab views are mounted into (rendered by <Workspace>). */
  attachWorkspace(element: HTMLElement | null): void {
    this.#workspace = element;
    if (element) for (const tab of this.tabs) element.append(tab.el);
    if (element) this.activeTab?.mount();
  }

  readonly #paneServices: PaneServices = {
    drawOverlay: (view) => drawPageOverlay(view, this.#searches.get(view.book)?.hitsOn(view.pageNumber)),
    flash: (view, rects) => flashRects(view, rects),
    isSelectTool: () => this.tools.current() === 'select',
    pageTransition: () => this.prefs.get('pageTransition'),
    onActivate: (pane) => {
      if (!this.activeTab?.panes.includes(pane) || pane === this.activePane) return;
      this.activeTab.setActivePane(pane);
      this.notify();
    },
    openExternal: (url) => window.open(url, '_blank', 'noopener'),
  };

  async openSources(sources: BookSource[]): Promise<void> {
    for (const source of sources) await this.openSource(source);
  }

  async openSource(source: BookSource): Promise<Tab | null> {
    if (source.kind === 'path') {
      const open = this.tabs.find((t) => t.book.filePath === source.path);
      if (open) return this.selectTab(open);
    }
    const loading = toast.loading('Opening book…');
    let book: Book;
    try {
      book = await Book.open(source, this.platform);
    } catch (error) {
      toast.error('Could not open this PDF', { id: loading, description: (error as Error).message });
      return null;
    }
    toast.dismiss(loading);
    // The same content under another path (a copy) shares its notes: keep one tab.
    const sameBook = this.tabs.find((t) => t.book.id === book.id);
    if (sameBook) {
      void book.close();
      return this.selectTab(sameBook);
    }
    const autoSplit = book.session.splitSpreads === null && looksLikeSpreadScan(book.pageSizes);
    if (book.session.splitSpreads === null) book.updateSession({ splitSpreads: autoSplit });

    const tab = new Tab(book, this.#paneServices, {
      autoScrollSpeed: this.prefs.get('autoScrollSpeed'),
      onPaneCreated: (pane) => this.#wirePane(pane),
    });
    book.on('history', () => this.notify());
    book.bookmarks.on('change', () => this.notify());
    applyTheme(tab.el, this.themeOf(book), this.prefs.get('customTint'));
    this.tabs.push(tab);
    this.#workspace?.append(tab.el);
    this.selectTab(tab);
    this.libraryVersion++;

    if (book.isFirstOpen) void actions.saveCover(this.platform, book).catch(() => {});
    if (autoSplit) {
      toast('Showing two-page scans as single pages', {
        description: 'This book was scanned as open spreads.',
        action: { label: 'Undo', onClick: () => this.commands.run('view.toggleSplitSpreads') },
        duration: 8000,
      });
    }
    void this.#offerOcrIfScanned(book);
    return tab;
  }

  #wirePane(pane: ReaderPane): void {
    this.annotations.attach(pane);
    pane.applyReflowSettings(this.reflowSettings());
    pane.on('page', () => this.notify());
    pane.on('view', () => this.notify());
  }

  selectTab(tab: Tab): Tab {
    if (this.activeTab !== tab) {
      this.activeTab?.panes.forEach((pane) => pane.autoScroller.stop());
      for (const t of this.tabs) t.el.hidden = t !== tab;
      this.activeTab = tab;
      this.editing = null;
      tab.mount();
      this.notify();
    }
    return tab;
  }

  async closeTab(tab: Tab | null = this.activeTab): Promise<void> {
    if (!tab) return;
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);
    // Switch away first so no command can reach the tab while it shuts down.
    if (this.activeTab === tab) {
      this.activeTab = null;
      this.editing = null;
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (next) this.selectTab(next);
    }
    this.libraryVersion++;
    this.notify();
    await tab.close();
  }

  showLibrary(): void {
    for (const t of this.tabs) {
      t.el.hidden = true;
      t.panes.forEach((pane) => pane.autoScroller.stop());
    }
    this.activeTab = null;
    this.editing = null;
    this.libraryVersion++;
    this.notify();
  }

  async removeFromLibrary(bookId: string): Promise<void> {
    await this.platform.removeFromLibrary(bookId);
    this.libraryVersion++;
    this.notify();
  }

  forEachPane(book: Book, fn: (pane: ReaderPane) => void): void {
    for (const tab of this.tabs) if (tab.book === book) tab.panes.forEach(fn);
  }

  // ---- UI state -----------------------------------------------------------------

  setSidebar(open: boolean, panel?: PanelId): void {
    this.sidebarOpen = open;
    if (panel) this.sidebarPanel = panel;
    this.prefs.set('sidebarOpen', open);
    if (panel) this.prefs.set('sidebarPanel', panel);
    this.notify();
  }

  editAnnotation(pane: ReaderPane, annotationId: string, at?: { x: number; y: number }): void {
    this.editing = { pane, annotationId, at };
    this.notify();
  }

  closeEditor(): void {
    if (!this.editing) return;
    this.editing = null;
    this.notify();
  }

  setShortcutsOpen(open: boolean): void {
    this.shortcutsOpen = open;
    this.notify();
  }

  setTheme(themeId: string): void {
    const book = this.activeBook;
    this.prefs.set('theme', themeId); // new books start in the last-used theme
    if (book) {
      book.updateSession({ theme: themeId });
      applyTheme(this.activeTab!.el, themeId, this.prefs.get('customTint'));
    }
    this.notify();
  }

  setReflowSettings(patch: Partial<ReflowSettings>): void {
    this.prefs.set('reflow', { ...this.reflowSettings(), ...patch });
    for (const tab of this.tabs) tab.panes.forEach((pane) => pane.applyReflowSettings(this.reflowSettings()));
  }

  /** The (per-book) search session, created on first use. */
  searchFor(book: Book): BookSearch {
    let search = this.#searches.get(book);
    if (!search) {
      search = new BookSearch(book);
      const redraw = () => this.forEachPane(book, (pane) => pane.redrawOverlays());
      search.on('results', redraw);
      search.on('current', redraw);
      this.#searches.set(book, search);
    }
    return search;
  }

  // ---- Open requests (OS "open with", deep links) ----------------------------------

  async handleOpenRequest(request: OpenRequest): Promise<void> {
    if (request.type === 'source') {
      await this.openSource(request.source);
      return;
    }
    const link = parseDeepLink(request.url);
    if (!link) return;
    const tab = await this.#tabForLink(link);
    if (!tab) {
      toast.error('That book isn’t in your library on this device.');
      return;
    }
    const passage = link.x != null && link.y != null && link.x2 != null && link.y2 != null ? [{ x1: link.x, y1: link.y, x2: link.x2, y2: link.y2 }] : undefined;
    tab.activePane.navigate({ page: link.page, x: link.x, y: link.y != null ? link.y + 20 : null }, { flash: passage });
    if (link.endPage && link.endPage > link.page) toast(`Linked passage: pages ${link.page}–${link.endPage}`);
  }

  async #tabForLink(link: DeepLink): Promise<Tab | null> {
    const open = this.tabs.find((t) => t.book.id === link.bookId);
    if (open) return this.selectTab(open);
    const entry = (await this.platform.listLibrary()).find((b) => b.bookId === link.bookId);
    const source = entry ? this.platform.sourceForLibraryEntry(entry) : link.file ? ({ kind: 'path', path: link.file } as const) : null;
    return source ? this.openSource(source) : null;
  }

  async #offerOcrIfScanned(book: Book): Promise<void> {
    if (!(await book.looksScanned())) return;
    toast('This looks like a scanned book', {
      description: 'Recognize its text to select, search and highlight it.',
      action: { label: 'Recognize text', onClick: () => void actions.runOcr(book, range(1, book.numPages)) },
      duration: 10000,
    });
  }
}
