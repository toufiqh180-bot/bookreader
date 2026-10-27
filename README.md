# BookReader

A free, open-source PDF reader built for **reading books**, not just viewing documents.

- **Desktop app** for macOS, Windows and Linux: download, install, and open it from your dock or Start menu.
- **Web app** that runs in any browser and installs to the home screen on iPhone, iPad and Android. It works offline.

It reflows text like an e-reader, turns pages like a book, offers night and sepia modes, crops wasted margins,
splits scanned two-page spreads, recognises text in scans, and keeps your highlights and notes in files you own.

## Features

|                         |                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Reflow view**         | Turns fixed pages into flowing text, with your choice of font, size, line spacing and column width.                                |
| **Page turns**          | Continuous scrolling, single pages, or a two-page book spread with a realistic page-turn animation (or slide, or none).            |
| **Scanned books**       | Books scanned as open spreads are split into single pages automatically. OCR makes scans selectable and searchable, offline.       |
| **Reading themes**      | Light, sepia, dark, warm night, high-contrast monochrome, and a custom tint with a brightness control.                             |
| **Smart margin crop**   | Detects the text block across the book and trims white margins (odd and even pages separately).                                    |
| **Zoom & pan**          | Pinch or ⌘/Ctrl-scroll to zoom. Two-finger scrolling pans around a zoomed page and never flips it by accident.                     |
| **Back / Forward**      | Browser-style history. Follow a link 200 pages ahead, then press Back to land exactly where you were.                              |
| **Tabs & split screen** | Several books in tabs, or the same book side by side, e.g. the index beside a chapter.                                             |
| **Annotations**         | Multi-colour highlights, underline, squiggly, strikethrough, sticky notes, comments, freehand pen and highlighter, with undo/redo. |
| **Export**              | Notes as Markdown, JSON or text; a PDF with annotations burned in (visible in every PDF app); a searchable PDF from OCR.           |
| **Deep links**          | Copy a link to an exact spot or passage in a book.                                                                                 |
| **Library**             | Covers, reading progress and note counts for everything you're reading.                                                            |

Your PDFs are never modified, and nothing is uploaded anywhere: notes live on your device.

## Download

Get the latest version from the [Releases page](https://github.com/toufiqh180-bot/bookreader/releases).

- **macOS** (Apple silicon and Intel): open `BookReader.dmg` and drag **BookReader** onto **Applications**. Or download
  `BookReader-<version>-macos.zip`, unzip it and move `BookReader.app` into Applications. The first time, right-click the app
  and choose **Open**, because the app isn't yet signed by Apple. If macOS still refuses, run
  `xattr -dr com.apple.quarantine /Applications/BookReader.app` in Terminal once.
- **Windows**: run `BookReader_<version>_x64-setup.exe`. SmartScreen may warn that the publisher is unknown; choose **More info → Run anyway**.
- **Linux**: make the `.AppImage` executable (`chmod +x`) and run it, or install the `.deb` package.

## Development

Requires [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/toufiqh180-bot/bookreader.git
cd bookreader
npm install
npm run dev          # desktop app with hot reload (needs Rust, see below)
npm run dev:web      # web version at http://localhost:5173
npm run check        # typecheck + lint + unit tests
npm run dist         # build the installers for this OS into src-tauri/target/release/bundle/
```

The desktop app is built with [Tauri](https://tauri.app/). Building it needs [Rust](https://rustup.rs/) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS. The web version needs only Node.js.

| Script            | What it does                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`     | Desktop app window with hot reload                                                         |
| `npm run dev:web` | Web version only                                                                           |
| `npm run build`   | Production build of the UI into `out/renderer` (the web app, also used by the desktop app) |
| `npm run dist`    | Desktop installers for the current OS                                                      |
| `npm run icons`   | Regenerate every icon and PNG from the SVG artwork in `build/`                             |
| `npm test`        | Unit tests (`node:test`, no browser needed)                                                |

## How the code is organised

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the layers, the folder layout, the storage schema, and how
to add a feature.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). BookReader builds on pdf.js (Apache-2.0), pdf-lib (MIT), Tesseract.js (Apache-2.0),
React (MIT), Radix UI and shadcn/ui (MIT), and Lucide icons (ISC).
