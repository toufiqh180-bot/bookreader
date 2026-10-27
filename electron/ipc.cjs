'use strict';
/**
 * IPC handlers — the only bridge between the sandboxed renderer and the file
 * system. Each channel backs one method of `window.bookreaderHost`
 * (preload.cjs). Book identity, OCR and PDF export run in the renderer, so
 * this layer only moves bytes and shows native dialogs.
 */
const { BrowserWindow, dialog, ipcMain, clipboard, shell } = require('electron');
const fsp = require('fs/promises');
const path = require('path');
const libraryStore = require('./library-store.cjs');

const FILTER_NAMES = { md: 'Markdown', json: 'JSON', txt: 'Plain text', pdf: 'PDF' };

const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

function registerIpc() {
  // ---- Files ----
  ipcMain.handle('dialog:open', async (event) => {
    const result = await dialog.showOpenDialog(windowOf(event), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('file:read', async (_event, filePath) => ({
    name: path.basename(filePath),
    bytes: new Uint8Array(await fsp.readFile(filePath)),
    path: filePath,
  }));

  ipcMain.handle('file:save', async (event, { suggestedName, data, extension }) => {
    const result = await dialog.showSaveDialog(windowOf(event), {
      defaultPath: suggestedName,
      filters: [{ name: FILTER_NAMES[extension] ?? 'File', extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, typeof data === 'string' ? data : Buffer.from(data));
    return result.filePath;
  });

  // ---- Library (per-book JSON records) ----
  ipcMain.handle('book:load', (_event, id) => libraryStore.loadBook(id));
  ipcMain.handle('book:save', (_event, id, record) => libraryStore.saveBook(id, record));
  ipcMain.handle('book:loadExtra', (_event, id, kind) => libraryStore.loadExtra(id, kind));
  ipcMain.handle('book:saveExtra', (_event, id, kind, data) => libraryStore.saveExtra(id, kind, data));
  ipcMain.handle('library:list', () => libraryStore.listBooks());
  ipcMain.handle('library:remove', (_event, id) => libraryStore.removeBook(id));
  ipcMain.handle('library:saveCover', (_event, id, dataUrl) => libraryStore.saveCover(id, dataUrl));
  ipcMain.handle('prefs:load', () => libraryStore.loadPreferences());
  ipcMain.handle('prefs:save', (_event, prefs) => libraryStore.savePreferences(prefs));

  // ---- Misc ----
  ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text)));
  ipcMain.handle('shell:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.on('window:title', (event, title) => windowOf(event)?.setTitle(String(title)));
}

module.exports = { registerIpc };
