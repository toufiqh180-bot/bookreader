# Architecture

BookReader is an [Electron](https://www.electronjs.org/) app. PDFs are rendered with
[pdf.js](https://mozilla.github.io/pdf.js/), exported with [pdf-lib](https://pdf-lib.js.org/), and
OCR'd with [Tesseract.js](https://tesseract.projectnaptha.com/). The renderer uses plain ES modules
and the DOM, with no UI framework and no bundler, so what you read in `src/` is what runs.

## Processes

```
┌──────────────────────── main process (Node, CommonJS) ────────────────────────┐
│ index.js     app lifecycle, window, app:// protocol, file & deep-link routing │
│ menu.js      application menu → sends command ids to the renderer             │
│ ipc.js       the IPC handlers (file access, dialogs, export, OCR)              │
│ services/    library-store (JSON on disk) · pdf-flattener (pdf-lib) · ocr      │
└───────────────────────────────▲───────────────────────────────────────────────┘
                                │ window.api (preload.js), one method per channel
┌───────────────────────────────┴──── renderer (browser, ES modules) ───────────┐
│ app/         composition root, commands, keymap, preferences, tabs, themes    │
│ components/  UI: reader, annotations, sidebar, toolbar, tabs, library, …      │
│ models/      Book and its stores (annotations, bookmarks), pdf.js wrapper     │
│ services/    search, OCR, margin detection, off-screen rendering              │
│ lib/         pure logic with no DOM: history, geometry, reflow, crop, export   │
└───────────────────────────────────────────────────────────────────────────────┘
```

The renderer is sandboxed (`contextIsolation`, `sandbox`, no Node integration). Everything that
touches the file system goes through `window.api` (`src/main/preload.js`).

## Source layout

```
src/
├── main/
│   ├── index.js                  entry point
│   ├── menu.js
│   ├── ipc.js
│   ├── preload.js
│   └── services/
│       ├── library-store.js      per-book JSON records, covers, preferences
│       ├── pdf-flattener.js      burns annotations / OCR text into a PDF copy
│       └── ocr-service.js        Tesseract worker (bundled English model)
└── renderer/
    ├── index.html · index.js     shell and entry point
    ├── app/
    │   ├── app.js                App: owns tabs + chrome, registers every command
    │   ├── command-registry.js   command id → handler
    │   ├── keymap.js             in-page shortcuts (+ the help sheet's table)
    │   ├── book-actions.js       export, OCR, margin crop, deep links, covers
    │   ├── tab.js                one open book: Book + 1–2 ReaderPanes
    │   ├── tool-state.js         active annotation tool, colours, widths
    │   ├── themes.js             reading themes
    │   └── preferences.js        app-wide settings
    ├── components/
    │   ├── reader/               ReaderPane, PageView, layouts, reflow, auto-scroll
    │   ├── annotations/          renderer, input controller, selection bar, editor
    │   ├── sidebar/              contents, pages, notes, bookmarks, search panels
    │   ├── toolbar/ · statusbar/ · tabs/ · library/
    │   └── common/               dom helpers, icons, toasts/menus/dialogs
    ├── models/                   Book, AnnotationStore, BookmarkStore, PdfDocument
    ├── services/                 BookSearch, OCR, margin detection, page rasterizer
    ├── lib/                      pure, unit-tested logic
    └── styles/                   one stylesheet per area
tests/unit/                       node:test suites for lib/ and models/
```

## Key ideas

**Commands, not callbacks.** Every user action has a command id (`view.zoomIn`, `nav.back`,
`annotate.highlight` …) registered once in `app.js`. The menu, toolbar, keyboard and selection
bar all dispatch ids, so an action behaves the same however it's triggered.

**One-way UI refresh.** Components that change state emit events. `App.refresh()` builds a
`ViewState` snapshot and hands it to the toolbar and status bar, which render from it and hold no
state of their own.

**PDF user space everywhere.** Annotation geometry, OCR words, search hits, history positions and
deep links all use PDF coordinates (points, origin bottom-left). Screen coordinates only exist at
the edges (`PageView.clientToPdf`, the SVG overlay's transform), so zoom, crop and rotation never
invalidate stored data.

**Pages are layered** (`components/reader/page-view.js`): canvas → theme tint → transparent text
layer → links → SVG annotations. Only the canvas depends on zoom; the other layers use CSS
variables, percentages and a scale-1 `viewBox`, so zooming only redraws the canvas.

**Layouts are strategies.** `ContinuousLayout` (virtualised vertical scroll) and `PagedLayout`
(single page or two-page spread with page-turn animation) implement the same small interface used
by `ReaderPane`.

**Pure logic lives in `lib/`** and is unit-tested without a browser: navigation history, reflow
paragraph detection, margin-crop maths, text-range geometry, deep links and export formats.

## Storage schema

Per book, `<userData>/library/<bookId>.json`, where `bookId` is a SHA-256 of the file's bytes, so
notes follow the book if it's renamed or moved:

```jsonc
{
  "bookId": "sha256-…",
  "fileName": "clean_code.pdf",
  "filePath": "/Users/me/Books/clean_code.pdf",
  "pageCount": 464,
  "lastSaved": "2026-10-27T06:00:00Z",
  "sessionState": {
    "lastPage": 42,
    "zoomLevel": 1.25,
    "zoomMode": "auto", // auto | fit-page | fit-width | custom
    "viewMode": "two-page", // continuous | single | two-page
    "theme": "sepia",
    "isMarginCropped": true,
    "navigationStack": [{ "page": 12, "x": 100, "y": 250, "timestamp": "…" }],
    "stackPointer": 0,
  },
  "annotations": [
    {
      "id": "annot-…",
      "type": "highlight",
      "page": 42,
      "color": "#FFEB3B",
      "createdAt": "…",
      "textQuoted": "…",
      "rects": [{ "x1": 72.5, "y1": 410, "x2": 450.2, "y2": 425.5 }],
      "comment": "…",
    },
    {
      "id": "annot-…",
      "type": "freehand",
      "tool": "pen",
      "page": 43,
      "color": "#FF5722",
      "strokeWidth": 2.5,
      "paths": [
        [
          { "x": 500, "y": 100 },
          { "x": 510, "y": 105 },
        ],
      ],
    },
  ],
  "bookmarks": [{ "id": "bmk-…", "page": 15, "title": "Chapter 2: Meaningful Names", "createdAt": "…" }],
}
```

Annotation `type` is one of `highlight`, `underline`, `squiggly`, `strikeout`, `note` or
`freehand`. Caches live next to the record: `<bookId>.ocr.json` (recognised words with PDF-space
boxes) and `<bookId>.crop.json` (odd/even crop boxes). Covers live in `covers/<bookId>.jpg`, and
app-wide settings in `<userData>/preferences.json`.

## Deep links

`bookreader://open?book=<bookId>&file=<path>&page=42&x=72&y=640[&x2=…&y2=…][&end=45]`.
The app registers the scheme with the OS. If the file has moved, the link is resolved by `bookId`
through the library. See `src/renderer/lib/deep-link.js`.

## Adding a feature

1. Put pure logic in `lib/` and write a test in `tests/unit/`.
2. Add a command in `App.#registerCommands()`.
3. Expose it from the menu (`src/main/menu.js`), the toolbar, and/or `keymap.js`.
4. If the UI needs new state, add it to `ViewState` and render it in `Toolbar.update()`.
