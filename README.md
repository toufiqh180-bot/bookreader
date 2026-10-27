# BookReader

A free, open-source PDF reader built for **reading books**, not just viewing documents. It runs on
macOS, Windows and Linux.

It reflows text like an e-reader, offers night and sepia modes, crops wasted margins, and keeps your
highlights and notes in files you own.

## Features

|                         |                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reflow view**         | Turns fixed pages into flowing text with your choice of font, size, line spacing and column width.                                                                              |
| **Reading themes**      | Light, sepia, dark, warm night, high-contrast monochrome and a custom tint with a brightness control.                                                                           |
| **Smart margin crop**   | Detects the text block across the book and trims the white margins (odd and even pages separately).                                                                             |
| **Scroll or flip**      | Continuous vertical scrolling, single-page flipping with a page-turn animation, or a two-page book spread.                                                                      |
| **Auto-scroll**         | Hands-free scrolling at an adjustable speed. Space pauses and resumes, ↑/↓ change the speed.                                                                                    |
| **Back / Forward**      | Browser-style history. Follow a link 200 pages ahead, then press Back to land exactly where you were.                                                                           |
| **Tabs & split screen** | Open several books in tabs, or show the same book twice, e.g. the index beside a chapter.                                                                                       |
| **Page thumbnails**     | A sidebar grid of every page, with bookmark and note badges.                                                                                                                    |
| **Annotations**         | Highlights in several colours, underline, squiggly underline and strikethrough, all locked to the text. Sticky notes and comments. Freehand pen and highlighter. Undo and redo. |
| **Export your notes**   | Markdown, JSON or plain text, in reading order.                                                                                                                                 |
| **Flattened PDF**       | Saves a copy with annotations drawn into the pages, so they show in every PDF app.                                                                                              |
| **OCR**                 | Recognises text in scanned books, offline, so you can select, search and highlight it. Can also save a searchable PDF.                                                          |
| **Deep links**          | Copy a `bookreader://` link to an exact spot or passage, and open it later.                                                                                                     |
| **Library**             | Covers, progress and note counts for everything you're reading.                                                                                                                 |

Notes are stored per book, keyed by the file's content, so they survive renames and moves. The
original PDF is never modified.

## Download

Prebuilt installers are attached to each [GitHub release](https://github.com/toufiqh180-bot/bookreader/releases):

- **macOS**: `.dmg`. The app isn't notarised yet, so the first time you open it, right-click it and choose **Open**.
- **Windows**: `.exe` installer or portable `.exe`.
- **Linux**: `.AppImage` or `.deb`.

## Keyboard shortcuts

| Action                     | Windows / Linux                        | macOS        |
| -------------------------- | -------------------------------------- | ------------ |
| Next / previous page       | Space / Shift+Space, PageDown / PageUp | same         |
| Back / forward (history)   | Alt+← / Alt+→                          | ⌘[ / ⌘]      |
| Toggle sidebar             | Ctrl+B                                 | ⌘B           |
| Zoom in / out / fit page   | Ctrl+= / Ctrl+- / Ctrl+0               | ⌘= / ⌘- / ⌘0 |
| Continuous ⇄ page mode     | Ctrl+M                                 | ⌘M           |
| Reflow view                | Ctrl+R                                 | ⌘R           |
| Highlight selection        | H                                      | H            |
| Sticky note on selection   | N                                      | N            |
| Cycle light / sepia / dark | T                                      | T            |
| Find                       | Ctrl+F                                 | ⌘F           |
| Bookmark page              | Ctrl+D                                 | ⌘D           |

Press **Ctrl/⌘ + /** in the app for the full list.

## Building from source

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/toufiqh180-bot/bookreader.git
cd bookreader
npm install
npm start            # run the app
npm test             # unit tests
npm run lint         # ESLint
npm run dist         # build installers for the current OS into dist/
```

## Project structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised, the storage
schema, and how to add a feature.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). BookReader bundles pdf.js (Apache-2.0), pdf-lib (MIT) and Tesseract.js (Apache-2.0).
