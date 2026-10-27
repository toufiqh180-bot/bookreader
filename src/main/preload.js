'use strict';
/**
 * The renderer's only access to the system. Exposes a small, explicit API
 * on `window.api`; every method maps to one IPC channel in ipc.js.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  // Files
  showOpenDialog: invoke('dialog:open'),
  readFile: invoke('file:read'),
  fileExists: invoke('file:exists'),
  pathForFile: (file) => webUtils.getPathForFile(file),

  // Library
  loadBook: invoke('book:load'),
  saveBook: invoke('book:save'),
  loadExtra: invoke('book:loadExtra'),
  saveExtra: invoke('book:saveExtra'),
  listLibrary: invoke('library:list'),
  removeFromLibrary: invoke('library:remove'),
  saveCover: invoke('library:setCover'),
  loadPrefs: invoke('prefs:load'),
  savePrefs: invoke('prefs:save'),

  // Export & tools
  exportText: invoke('export:text'),
  exportPdf: invoke('export:pdf'),
  ocr: invoke('ocr:recognize'),

  // Misc
  copyText: invoke('clipboard:write'),
  revealInFolder: invoke('shell:reveal'),
  appInfo: invoke('app:info'),
  setTitle: (title) => ipcRenderer.send('window:title', title),

  // Lifecycle: tells the main process it can deliver queued open requests.
  signalReady: () => ipcRenderer.send('renderer:ready'),

  // Events from the main process
  onCommand: (handler) => ipcRenderer.on('command', (_event, command, arg) => handler(command, arg)),
  onOpenRequest: (handler) => ipcRenderer.on('open-request', (_event, request) => handler(request)),
});
