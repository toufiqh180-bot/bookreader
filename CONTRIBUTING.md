# Contributing

Thanks for helping make BookReader better.

## Getting set up

```bash
npm install
npm start
```

Open DevTools with **View → Toggle Developer Tools**. The running app is available in the console
as `window.bookReader`.

## Before opening a pull request

```bash
npm test          # unit tests (node:test, no browser needed)
npm run lint      # ESLint
npm run format    # Prettier
```

CI runs the same checks on every pull request.

## Code guidelines

- **Know where code goes.** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the folders.
  Logic that doesn't need the DOM belongs in `src/renderer/lib/` and should come with a test.
- **Add actions as commands.** Register them in `App.#registerCommands()` and trigger them from
  the menu, toolbar or keymap. Don't wire buttons straight to components.
- **Store geometry in PDF user space**, never screen pixels.
- **Keep files small and focused.** One class or concern per file. Name files in `kebab-case.js`
  and classes in `PascalCase`.
- **Comment the why, not the what.** A short header comment on each file saying what it's
  responsible for helps the next reader.
- **No new runtime dependencies** without discussion. The app should stay small and work offline.

## Reporting bugs

Please include your OS, the app version (**About BookReader**), and if possible a PDF that
reproduces the problem (or a description of it, if the book is private).
