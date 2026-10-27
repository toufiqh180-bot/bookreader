# Contributing

Thanks for helping make BookReader better.

## Setup

```bash
npm install
npm run dev        # desktop app with hot reload
npm run dev:web    # or the browser version
```

In either, the running app is available in DevTools as `window.bookReader` (the `AppController`).

## Before opening a pull request

```bash
npm run check      # typecheck + lint + unit tests
npm run format     # Prettier
```

CI runs the same checks, plus a production build, on every pull request.

## Guidelines

- **Know where code goes.** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the layers. Logic that
  doesn't need the DOM belongs in `src/lib/` and comes with a test in `tests/unit/`.
- **Actions are commands.** Add them to `src/app/commands.ts` and trigger them with `useCommand()`, the
  keymap or the desktop menu. Don't wire buttons straight into the engine.
- **React renders; it doesn't own state.** Read state with `useAppState()`; change it through commands or
  `AppController` methods.
- **Store geometry in PDF user space**, never in screen pixels.
- **Host-specific code goes behind `Platform`** and needs both an Electron and a web implementation.
- **Keep files focused**: one component, class or concern per file. Components use `PascalCase.tsx`, other
  modules `kebab-case.ts`. Relative imports include the file extension.
- **Comment the why.** Start each file with a short comment saying what it's responsible for.
- **No new runtime dependencies** without discussion; the app should stay small and work offline.

## Logo and icons

The artwork lives in `build/` as SVG: `icon.svg` (app icon), `icon-maskable.svg` (phone home screens) and
`dmg-background.svg` (macOS installer window). After editing one, regenerate every PNG size with:

```bash
npm run icons
```

## Reporting bugs

Please include your OS (or browser and device), the app version, and if possible a PDF that reproduces the
problem — or a description of it, if the book is private.
