/**
 * App — the renderer's composition root.
 *
 * Owns the open tabs, the shared UI chrome (tab bar, toolbar, sidebar,
 * status bar, library) and the command table. Components never call each
 * other directly: they dispatch command ids, and the App re-renders the
 * chrome from a single ViewState snapshot whenever something changes.
 *
 * @typedef {object} ViewState
 * @property {boolean} hasBook
 * @property {number} page
 * @property {string} pageLabel
 * @property {number} pageCount
 * @property {boolean} canGoBack
 * @property {boolean} canGoForward
 * @property {'continuous'|'single'|'two-page'} mode
 * @property {boolean} reflow
 * @property {object} reflowSettings
 * @property {number} zoomPercent
 * @property {string} zoomMode
 * @property {string} theme
 * @property {boolean} crop
 * @property {boolean} split
 * @property {{ active: boolean, paused: boolean, speed: number }} autoScroll
 * @property {string} tool
 * @property {string} toolColor
 * @property {number} toolWidth
 */
import { Book } from '../models/book.js';
import { Tab } from './tab.js';
import { CommandRegistry } from './command-registry.js';
import { installKeymap, SHORTCUT_HELP } from './keymap.js';
import { ToolState } from './tool-state.js';
import { applyTheme, nextQuickTheme, themeById, DEFAULT_CUSTOM_TINT } from './themes.js';
import * as actions from './book-actions.js';
import { parseDeepLink } from '../lib/deep-link.js';
import { clamp } from '../lib/util.js';
import { BookSearch } from '../services/book-search.js';
import { drawPageOverlay, flashRects } from '../components/annotations/annotation-renderer.js';
import { AnnotationController } from '../components/annotations/annotation-controller.js';
import { AnnotationEditor } from '../components/annotations/annotation-editor.js';
import { SelectionBar } from '../components/annotations/selection-bar.js';
import { clearSelection, selectedText } from '../components/annotations/text-selection.js';
import { Sidebar } from '../components/sidebar/sidebar.js';
import { Toolbar } from '../components/toolbar/toolbar.js';
import { TabBar } from '../components/tabs/tab-bar.js';
import { StatusBar } from '../components/statusbar/status-bar.js';
import { LibraryView } from '../components/library/library-view.js';
import { DEFAULT_REFLOW_SETTINGS } from '../components/reader/reflow-view.js';
import { toast, prompt, showMenu, closeFloating } from '../components/common/overlays.js';
import { el, $ } from '../components/common/dom.js';

const ZOOM_STEP = 1.2;
const AUTOSCROLL_STEP = 1.25;
const REFLOW_MIN_FONT_PX = 12;
const REFLOW_MAX_FONT_PX = 36;
const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 560;

export class App {
  /** @param {import('./preferences.js').Preferences} prefs */
  constructor(prefs) {
    this.prefs = prefs;
    /** @type {Tab[]} */
    this.tabs = [];
    /** @type {Tab|null} */
    this.activeTab = null;
    /** @type {WeakMap<Book, BookSearch>} */
    this.searches = new WeakMap();
    this.commands = new CommandRegistry();
    this.tools = new ToolState(prefs);
    /** Panes whose events are already connected to the chrome. */
    this.wiredPanes = new WeakSet();

    this.annotationEditor = new AnnotationEditor();
    this.selectionBar = new SelectionBar({
      getPane: () => this.activePane,
      isSelectTool: () => this.tools.current === 'select',
      actions: {
        markup: (pane, type, color) => this.annotationController.applyMarkup(pane, type, color),
        note: (pane) => this.annotationController.addNoteToSelection(pane),
        copy: () => window.api.copyText(selectedText()).then(() => toast('Copied')),
        copyLink: () => this.commands.run('nav.copyLink'),
        search: (text) => this.#searchSelection(text),
      },
    });
    this.annotationController = new AnnotationController({ tools: this.tools, editor: this.annotationEditor, selectionBar: this.selectionBar });

    /** Collaborators every ReaderPane needs (see PaneServices). */
    this.paneServices = {
      drawOverlay: (pv) => drawPageOverlay(pv, this.searches.get(pv.book)?.hitsOn(pv.pageNumber)),
      flash: (pv, rects) => flashRects(pv, rects),
      isSelectTool: () => this.tools.current === 'select',
      animationsEnabled: () => this.prefs.get('animations', true),
      onActivate: (pane) => this.#activatePane(pane),
    };

    this.#mountChrome();
    this.#registerCommands();
    installKeymap(this.commands);
    this.tools.on('change', () => this.refresh());
    window.api.onCommand((command, arg) => this.commands.run(command, arg));
    window.api.onOpenRequest((request) => this.#handleOpenRequest(request));
    this.#installDropTarget();
    this.#showLibrary();
    window.api.signalReady();
  }

  // ---- Accessors ------------------------------------------------------------

  get activePane() {
    return this.activeTab?.activePane ?? null;
  }

  get activeBook() {
    return this.activeTab?.book ?? null;
  }

  /** The (per-book) search session, created on first use. */
  searchFor(book) {
    if (!this.searches.has(book)) {
      const search = new BookSearch(book);
      const redraw = () => this.#forEachPane(book, (pane) => pane.redrawOverlays());
      search.on('results', redraw);
      search.on('current', redraw);
      this.searches.set(book, search);
    }
    return this.searches.get(book);
  }

  // ---- Chrome -----------------------------------------------------------------

  #mountChrome() {
    const run = (command, arg) => this.commands.run(command, arg);
    this.tabBar = new TabBar($('#tabbar'), {
      onSelect: (tab) => this.#selectTab(tab),
      onClose: (tab) => this.closeTab(tab),
      onNew: () => run('file.open'),
    });
    this.toolbar = new Toolbar($('#toolbar'), { run, app: this });
    this.statusBar = new StatusBar($('#statusbar'), { run });
    this.sidebar = new Sidebar($('#sidebar'), {
      initialPanel: this.prefs.get('sidebarPanel'),
      onPanelChange: (id) => {
        this.prefs.set('sidebarPanel', id);
        if (this.isSidebarHidden) this.#setSidebarVisible(true);
      },
    });
    this.library = new LibraryView($('#library'), {
      onOpenPath: (path) => this.openPath(path),
      onBrowse: () => run('file.open'),
      onRemove: (bookId) => this.#removeFromLibrary(bookId),
    });
    this.workspace = $('#workspace');
    this.#setSidebarVisible(this.prefs.get('sidebarOpen', true));
    this.#installSidebarResizer();
  }

  get isSidebarHidden() {
    return document.body.classList.contains('sidebar-hidden');
  }

  #setSidebarVisible(visible) {
    document.body.classList.toggle('sidebar-hidden', !visible);
    this.prefs.set('sidebarOpen', visible);
  }

  #installSidebarResizer() {
    const sidebar = $('#sidebar');
    sidebar.style.width = `${this.prefs.get('sidebarWidth', 280)}px`;
    $('#sidebar-resizer').addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebar.offsetWidth;
      const onMove = (e) => (sidebar.style.width = `${clamp(startWidth + e.clientX - startX, SIDEBAR_MIN_PX, SIDEBAR_MAX_PX)}px`);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        this.prefs.set('sidebarWidth', sidebar.offsetWidth);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  #installDropTarget() {
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('dragging');
    });
    window.addEventListener('dragleave', (e) => !e.relatedTarget && document.body.classList.remove('dragging'));
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging');
      for (const file of e.dataTransfer.files) {
        if (file.name.toLowerCase().endsWith('.pdf')) this.openPath(window.api.pathForFile(file));
      }
    });
  }

  /** Re-renders all chrome from the current state. Cheap; call freely. */
  refresh() {
    const state = this.viewState();
    this.toolbar.update(state);
    this.statusBar.update(state);
    this.tabBar.render(this.tabs, this.activeTab);
    this.workspace.dataset.tool = this.tools.current;
    const theme = state.hasBook ? state.theme : this.prefs.get('theme', 'light');
    document.body.dataset.chrome = themeById(theme).chrome;
    window.api.setTitle(this.activeBook ? `${this.activeBook.fileName} — BookReader` : 'BookReader');
  }

  /** @returns {ViewState} */
  viewState() {
    const pane = this.activePane;
    const tool = this.tools.current;
    const base = { hasBook: Boolean(pane), tool, toolColor: this.tools.colorFor(tool), toolWidth: this.tools.widthFor(tool) };
    if (!pane) return base;
    const { book } = pane;
    return {
      ...base,
      page: pane.currentPage,
      pageLabel: book.pageLabel(pane.currentPage),
      pageCount: book.numPages,
      canGoBack: book.history.canGoBack,
      canGoForward: book.history.canGoForward,
      mode: pane.mode,
      reflow: pane.reflow.active,
      reflowSettings: this.#reflowSettings(),
      zoomPercent: Math.round(pane.scale * 100),
      zoomMode: pane.zoomMode,
      theme: this.#themeOf(book),
      crop: pane.cropEnabled,
      split: this.activeTab.isSplit,
      autoScroll: { active: pane.autoScroller.active, paused: pane.autoScroller.paused, speed: pane.autoScroller.speed },
    };
  }

  // ---- Tabs ---------------------------------------------------------------------

  async openPath(path) {
    const existing = this.tabs.find((t) => t.book.filePath === path);
    if (existing) {
      this.#selectTab(existing);
      return existing;
    }
    const loading = toast(`Opening ${path.split(/[\\/]/).pop()}…`, { duration: 0 });
    let book;
    try {
      book = await Book.open(path);
    } catch (error) {
      loading.close();
      toast(`Could not open this PDF: ${error.message}`);
      return null;
    } finally {
      loading.close();
    }
    // Same content under another path (a copy) shares notes; keep one tab.
    const sameBook = this.tabs.find((t) => t.book.id === book.id);
    if (sameBook) {
      book.close();
      this.#selectTab(sameBook);
      return sameBook;
    }

    const tab = new Tab(book, this.paneServices, { autoScrollSpeed: this.prefs.get('autoScrollSpeed', 60) });
    tab.panes.forEach((pane) => this.#wirePane(pane));
    book.on('history', () => this.refresh());
    applyTheme(tab.el, this.#themeOf(book), this.prefs.get('customTint', DEFAULT_CUSTOM_TINT));
    this.workspace.append(tab.el);
    this.tabs.push(tab);
    this.#selectTab(tab);

    if (book.isFirstOpen) actions.saveCover(book).catch(() => {});
    this.#offerOcrIfScanned(book);
    return tab;
  }

  #wirePane(pane) {
    if (this.wiredPanes.has(pane)) return;
    this.wiredPanes.add(pane);
    this.annotationController.attach(pane);
    pane.reflow.applySettings(this.#reflowSettings());
    pane.on('page', (page) => {
      if (pane === this.activePane) this.sidebar.onPageChange(page);
      this.refresh();
    });
    pane.on('view', () => this.refresh());
  }

  #selectTab(tab) {
    if (this.activeTab === tab) return;
    this.activeTab?.panes.forEach((pane) => pane.autoScroller.stop());
    for (const t of this.tabs) t.el.hidden = t !== tab;
    this.library.root.hidden = true;
    this.activeTab = tab;
    tab.mount();
    this.sidebar.setContext({ book: tab.book, pane: () => tab.activePane, app: this });
    this.refresh();
  }

  async closeTab(tab = this.activeTab) {
    if (!tab) return;
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);
    // Switch away first so no command can reach the tab while it shuts down.
    if (this.activeTab === tab) {
      this.activeTab = null;
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      if (next) this.#selectTab(next);
      else this.#showLibrary();
    }
    this.refresh();
    await tab.close();
  }

  #showLibrary() {
    for (const t of this.tabs) t.el.hidden = true;
    this.activeTab = null;
    this.library.root.hidden = false;
    this.library.render();
    this.sidebar.setContext(null);
    this.refresh();
  }

  async #removeFromLibrary(bookId) {
    if (!window.confirm('Remove this book from the library? Its highlights, notes and bookmarks will be deleted. The PDF file itself is not touched.')) return;
    await window.api.removeFromLibrary(bookId);
    this.library.render();
  }

  #activatePane(pane) {
    if (!this.activeTab || pane === this.activePane || !this.activeTab.panes.includes(pane)) return;
    this.activeTab.setActivePane(pane);
    this.refresh();
  }

  #forEachPane(book, fn) {
    for (const tab of this.tabs) if (tab.book === book) tab.panes.forEach(fn);
  }

  // ---- Settings helpers -------------------------------------------------------

  #themeOf(book) {
    return book.session.theme ?? this.prefs.get('theme', 'light');
  }

  #setTheme(themeId) {
    const book = this.activeBook;
    if (!book) return;
    book.session.theme = themeId;
    book.save();
    this.prefs.set('theme', themeId); // new books start in the last-used theme
    applyTheme(this.activeTab.el, themeId, this.prefs.get('customTint', DEFAULT_CUSTOM_TINT));
    this.refresh();
  }

  #reflowSettings() {
    return { ...DEFAULT_REFLOW_SETTINGS, ...this.prefs.get('reflow') };
  }

  // ---- Open requests (Finder / Explorer, deep links) -----------------------------

  async #handleOpenRequest(request) {
    if (request.type === 'file') {
      await this.openPath(request.path);
      return;
    }
    const link = parseDeepLink(request.url);
    if (!link) return;
    const tab = await this.#tabForLink(link);
    if (!tab) {
      toast('The book for this link is not in your library on this computer.');
      return;
    }
    const pane = tab.activePane;
    const passage = link.x2 != null && link.y2 != null ? [{ x1: link.x, y1: link.y, x2: link.x2, y2: link.y2 }] : null;
    pane.navigate({ page: link.page, x: link.x, y: link.y != null ? link.y + 20 : null }, { flash: passage });
    if (link.endPage && link.endPage > link.page) toast(`Linked passage: pages ${link.page}–${link.endPage}`);
  }

  async #tabForLink(link) {
    const open = this.tabs.find((t) => t.book.id === link.bookId);
    if (open) {
      this.#selectTab(open);
      return open;
    }
    if (link.file && (await window.api.fileExists(link.file))) return this.openPath(link.file);
    // The file moved: find it by content id in the library.
    const known = (await window.api.listLibrary()).find((b) => b.bookId === link.bookId && b.exists);
    return known ? this.openPath(known.filePath) : null;
  }

  async #offerOcrIfScanned(book) {
    if (!(await book.looksScanned())) return;
    toast('This looks like a scanned book with no selectable text.', {
      action: { label: 'Recognize text', run: () => actions.runOcr(book, range(1, book.numPages)) },
      duration: 8000,
    });
  }

  #searchSelection(text) {
    this.sidebar.show('search');
    this.sidebar.panel?.setQuery?.(text.trim());
  }

  // ---- Commands -----------------------------------------------------------------

  #registerCommands() {
    // Commands that need an open book are no-ops on the library screen.
    const withPane = (fn) => (arg) => (this.activePane ? fn(this.activePane, arg) : undefined);

    this.commands.registerAll({
      // File
      'file.open': async () => {
        for (const path of await window.api.showOpenDialog()) await this.openPath(path);
      },
      'file.library': () => this.#showLibrary(),
      'file.closeTab': () => this.closeTab(),

      // Edit
      'edit.undo': () => this.#undoRedo('undo'),
      'edit.redo': () => this.#undoRedo('redo'),

      // Export & tools
      'export.annotations': (format) => this.activeBook && actions.exportAnnotations(this.activeBook, format),
      'export.flattened': () => this.activeBook && actions.exportPdf(this.activeBook, { annotations: true }),
      'export.searchable': () => this.activeBook && actions.exportPdf(this.activeBook, { annotations: false, ocr: true }),
      'tools.ocr': withPane((pane, scope) => actions.runOcr(pane.book, scope === 'all' ? range(1, pane.book.numPages) : [pane.currentPage])),
      'tools.recomputeCrop': withPane(async (pane) => {
        if (await actions.ensureCrop(pane.book, { force: true })) this.activeTab.panes.forEach((p) => p.setCrop(true));
      }),

      // Navigation
      'nav.next': withPane((pane) => pane.next()),
      'nav.previous': withPane((pane) => pane.previous()),
      'nav.spacebar': withPane((pane) => (pane.autoScroller.active ? pane.autoScroller.togglePause() : pane.next())),
      'nav.nextInPageMode': withPane((pane) => (pane.isPaged && !pane.reflow.active ? pane.next() : false)),
      'nav.previousInPageMode': withPane((pane) => (pane.isPaged && !pane.reflow.active ? pane.previous() : false)),
      'nav.firstPage': withPane((pane) => pane.navigate({ page: 1 })),
      'nav.lastPage': withPane((pane) => pane.navigate({ page: pane.book.numPages })),
      'nav.back': withPane((pane) => pane.back()),
      'nav.forward': withPane((pane) => pane.forward()),
      'nav.goToPage': withPane(async (pane, value) => {
        const input = value ?? (await prompt({ title: 'Go to page', placeholder: `1–${pane.book.numPages} or a printed page label`, okLabel: 'Go' }));
        const page = resolvePageInput(pane.book, input);
        if (page) pane.navigate({ page });
        else if (input) toast(`No page “${input}”.`);
        this.refresh();
      }),
      'nav.find': () => this.activeBook && this.sidebar.show('search'),
      'nav.toggleBookmark': withPane(async (pane) => {
        const page = pane.currentPage;
        const { bookmarks } = pane.book;
        if (bookmarks.has(page)) {
          bookmarks.removeOnPage(page);
          toast(`Bookmark on page ${pane.book.pageLabel(page)} removed`);
        } else {
          const title = (await pane.book.doc.sectionTitleFor(page)) ?? `Page ${pane.book.pageLabel(page)}`;
          bookmarks.add(page, title);
          toast(`Bookmarked: ${title}`);
        }
      }),
      'nav.copyLink': withPane((pane) => actions.copyDeepLink(pane)),

      // View
      'view.toggleSidebar': () => this.#setSidebarVisible(this.isSidebarHidden),
      // In reflow view, zoom changes the text size instead of the page scale.
      'view.zoomIn': withPane((pane) => (pane.reflow.active ? this.#stepReflowFontSize(+1) : pane.zoomBy(ZOOM_STEP))),
      'view.zoomOut': withPane((pane) => (pane.reflow.active ? this.#stepReflowFontSize(-1) : pane.zoomBy(1 / ZOOM_STEP))),
      'view.zoomTo': withPane((pane, scale) => pane.setZoom('custom', scale)),
      'view.zoomMode': withPane((pane, mode) => pane.setZoom(mode)),
      'view.fitPage': withPane((pane) => pane.setZoom('fit-page')),
      'view.fitWidth': withPane((pane) => pane.setZoom('fit-width')),
      'view.mode': withPane((pane, mode) => pane.setMode(mode)),
      'view.toggleMode': withPane((pane) => pane.toggleMode()),
      'view.toggleReflow': withPane((pane) => pane.setReflow(!pane.reflow.active)),
      'view.reflowSettings': (patch) => {
        this.prefs.set('reflow', { ...this.#reflowSettings(), ...patch });
        for (const tab of this.tabs) tab.panes.forEach((pane) => pane.reflow.applySettings(this.#reflowSettings()));
        this.refresh();
      },
      'view.toggleCrop': withPane(async (pane) => {
        const enable = !pane.cropEnabled;
        if (enable && !(await actions.ensureCrop(pane.book))) return;
        this.activeTab.panes.forEach((p) => p.setCrop(enable));
      }),
      'view.toggleSplit': () => {
        if (!this.activeTab) return;
        this.activeTab.toggleSplit();
        this.activeTab.panes.forEach((pane) => this.#wirePane(pane));
        this.refresh();
      },
      'view.theme': (themeId) => this.#setTheme(themeId),
      'view.cycleTheme': () => this.activeBook && this.#setTheme(nextQuickTheme(this.#themeOf(this.activeBook))),
      'view.customTint': (tint) => {
        this.prefs.set('customTint', tint);
        this.#setTheme('custom');
      },
      'view.toggleAutoScroll': withPane((pane) => pane.toggleAutoScroll()),
      'view.toggleAutoScrollPause': withPane((pane) => pane.autoScroller.togglePause()),
      'view.autoScrollSpeed': withPane((pane, speed) => this.#setAutoScrollSpeed(pane, speed)),
      'view.autoScrollFaster': withPane((pane) =>
        pane.autoScroller.active ? this.#setAutoScrollSpeed(pane, pane.autoScroller.speed * AUTOSCROLL_STEP) : false,
      ),
      'view.autoScrollSlower': withPane((pane) =>
        pane.autoScroller.active ? this.#setAutoScrollSpeed(pane, pane.autoScroller.speed / AUTOSCROLL_STEP) : false,
      ),

      // Annotation tools
      'tool.set': (tool) => this.tools.set(tool),
      'tool.color': (color) => this.tools.setColor(color),
      'tool.width': (width) => this.tools.setWidth(width),
      'annotate.highlight': withPane((pane) => {
        if (!this.annotationController.applyMarkup(pane, 'highlight')) this.tools.set('highlight');
      }),
      'annotate.note': withPane((pane) => {
        if (!this.annotationController.addNoteToSelection(pane)) this.tools.set('note');
      }),

      // App
      'app.escape': () => {
        closeFloating();
        this.annotationEditor.close();
        this.selectionBar.hide();
        clearSelection();
        this.activePane?.autoScroller.stop();
        this.tools.set('select');
      },
      'help.shortcuts': () => this.#showShortcuts(),
    });
  }

  #stepReflowFontSize(delta) {
    const size = clamp(this.#reflowSettings().size + delta, REFLOW_MIN_FONT_PX, REFLOW_MAX_FONT_PX);
    this.commands.run('view.reflowSettings', { size });
  }

  #setAutoScrollSpeed(pane, speed) {
    pane.autoScroller.setSpeed(speed);
    this.prefs.set('autoScrollSpeed', pane.autoScroller.speed);
  }

  /** Undo/redo applies to text fields while typing, otherwise to annotations. */
  #undoRedo(kind) {
    if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      document.execCommand(kind);
      return;
    }
    const store = this.activeBook?.annotations;
    if (store && !store[kind]()) toast(`Nothing to ${kind}`);
  }

  /** Opens the export menu anchored to an element (used by the Notes panel). */
  showExportMenu(anchor) {
    showMenu(anchor, [
      { label: 'Markdown (.md)', run: () => this.commands.run('export.annotations', 'md') },
      { label: 'JSON (.json)', run: () => this.commands.run('export.annotations', 'json') },
      { label: 'Plain text (.txt)', run: () => this.commands.run('export.annotations', 'txt') },
      '-',
      { label: 'Flattened PDF with annotations…', run: () => this.commands.run('export.flattened') },
    ]);
  }

  #showShortcuts() {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const rows = SHORTCUT_HELP.map(([action, other, mac]) =>
      el('tr', {}, [el('td', { text: action }), el('td', {}, [el('kbd', { text: isMac ? mac : other })])]),
    );
    const close = () => backdrop.remove();
    const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close() }, [
      el('div', { class: 'modal wide' }, [
        el('h2', { text: 'Keyboard shortcuts' }),
        el('table', { class: 'shortcuts' }, rows),
        el('div', { class: 'modal-actions' }, [el('button', { class: 'primary-btn', text: 'Done', onclick: close })]),
      ]),
    ]);
    document.body.append(backdrop);
  }
}

// ---- Helpers ----------------------------------------------------------------

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Accepts a page number or a printed label ("xii"); returns a page or null. */
function resolvePageInput(book, input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  for (let n = 1; n <= book.numPages; n++) if (book.pageLabel(n) === text) return n;
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? clamp(number, 1, book.numPages) : null;
}
