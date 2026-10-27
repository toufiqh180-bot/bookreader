'use strict';
/**
 * IPC handlers: the only bridge between the sandboxed renderer and the
 * file system. Each channel matches one method on `window.api` (preload.js).
 */
const { BrowserWindow, dialog, ipcMain, clipboard, shell, app } = require('electron');
const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const libraryStore = require('./services/library-store');

const SAVE_FILTERS = { md: 'Markdown', json: 'JSON', txt: 'Plain text', pdf: 'PDF' };

/** A book's id is a hash of its bytes, so notes survive renames and moves. */
function bookIdFor(bytes) {
  return `sha256-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}`;
}

async function askSavePath(event, defaultName, ext) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    defaultPath: defaultName,
    filters: [{ name: SAVE_FILTERS[ext] ?? 'File', extensions: [ext] }],
  });
  return result.canceled ? null : result.filePath;
}

function registerIpc() {
  // ---- Files ----------------------------------------------------------------
  ipcMain.handle('dialog:open', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('file:read', async (_event, filePath) => {
    const bytes = await fsp.readFile(filePath);
    return { data: new Uint8Array(bytes), bookId: bookIdFor(bytes), name: path.basename(filePath), path: filePath };
  });

  ipcMain.handle('file:exists', (_event, filePath) =>
    fsp.access(filePath).then(
      () => true,
      () => false,
    ),
  );

  // ---- Library (per-book JSON records) ------------------------------------
  ipcMain.handle('book:load', (_event, bookId) => libraryStore.loadBook(bookId));
  ipcMain.handle('book:save', (_event, bookId, record) => libraryStore.saveBook(bookId, record));
  ipcMain.handle('book:loadExtra', (_event, bookId, kind) => libraryStore.loadExtra(bookId, kind));
  ipcMain.handle('book:saveExtra', (_event, bookId, kind, data) => libraryStore.saveExtra(bookId, kind, data));
  ipcMain.handle('library:list', () => libraryStore.listBooks());
  ipcMain.handle('library:remove', (_event, bookId) => libraryStore.removeBook(bookId));
  ipcMain.handle('library:setCover', (_event, bookId, dataUrl) => libraryStore.saveCover(bookId, dataUrl));
  ipcMain.handle('prefs:load', () => libraryStore.loadPreferences());
  ipcMain.handle('prefs:save', (_event, prefs) => libraryStore.savePreferences(prefs));

  // ---- Export -------------------------------------------------------------
  ipcMain.handle('export:text', async (event, { defaultName, content, ext }) => {
    const target = await askSavePath(event, defaultName, ext);
    if (target) await fsp.writeFile(target, content, 'utf8');
    return target;
  });

  ipcMain.handle('export:pdf', async (event, { sourcePath, annotations, ocr, defaultName }) => {
    const target = await askSavePath(event, defaultName, 'pdf');
    if (!target) return null;
    // Loaded lazily: pdf-lib is only needed when exporting.
    const { buildAnnotatedPdf } = require('./services/pdf-flattener');
    await fsp.writeFile(target, await buildAnnotatedPdf(await fsp.readFile(sourcePath), { annotations, ocr }));
    return target;
  });

  // ---- OCR ----------------------------------------------------------------
  ipcMain.handle('ocr:recognize', (_event, pngBytes) => require('./services/ocr-service').recognize(Buffer.from(pngBytes)));

  // ---- Misc ---------------------------------------------------------------
  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text)));
  ipcMain.handle('shell:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle('app:info', () => ({ platform: process.platform, version: app.getVersion() }));
  ipcMain.on('window:title', (event, title) => BrowserWindow.fromWebContents(event.sender)?.setTitle(String(title)));
}

module.exports = { registerIpc };
