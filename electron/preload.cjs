'use strict';
/**
 * Exposes `window.bookreaderHost` — the renderer's only access to the system.
 * Keep in sync with `ElectronHost` in src/platform/electron-platform.ts.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('bookreaderHost', {
  platform: process.platform,

  showOpenDialog: invoke('dialog:open'),
  readFile: invoke('file:read'),
  saveFile: invoke('file:save'),
  pathForFile: (file) => webUtils.getPathForFile(file),

  loadBook: invoke('book:load'),
  saveBook: invoke('book:save'),
  loadExtra: invoke('book:loadExtra'),
  saveExtra: invoke('book:saveExtra'),
  listLibrary: invoke('library:list'),
  removeFromLibrary: invoke('library:remove'),
  saveCover: invoke('library:saveCover'),
  loadPrefs: invoke('prefs:load'),
  savePrefs: invoke('prefs:save'),

  copyText: invoke('clipboard:write'),
  revealInFolder: invoke('shell:reveal'),
  setTitle: (title) => ipcRenderer.send('window:title', title),
  signalReady: () => ipcRenderer.send('renderer:ready'),

  onCommand: (handler) => ipcRenderer.on('command', (_event, command, arg) => handler(command, arg)),
  onOpenRequest: (handler) => ipcRenderer.on('open-request', (_event, request) => handler(request)),
});
