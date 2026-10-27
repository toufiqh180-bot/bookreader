'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  fileExists: (p) => ipcRenderer.invoke('file:exists', p),
  loadBook: (id) => ipcRenderer.invoke('book:load', id),
  saveBook: (id, data) => ipcRenderer.invoke('book:save', id, data),
  loadExtra: (id, kind) => ipcRenderer.invoke('book:loadExtra', id, kind),
  saveExtra: (id, kind, data) => ipcRenderer.invoke('book:saveExtra', id, kind, data),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  removeFromLibrary: (id) => ipcRenderer.invoke('library:remove', id),
  setCover: (id, dataUrl) => ipcRenderer.invoke('library:setCover', id, dataUrl),
  loadPrefs: () => ipcRenderer.invoke('prefs:load'),
  savePrefs: (p) => ipcRenderer.invoke('prefs:save', p),
  exportText: (opts) => ipcRenderer.invoke('export:text', opts),
  flatten: (opts) => ipcRenderer.invoke('pdf:flatten', opts),
  ocr: (pngBytes) => ipcRenderer.invoke('ocr:recognize', pngBytes),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  info: () => ipcRenderer.invoke('app:info'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  setTitle: (t) => ipcRenderer.send('window:title', t),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd, arg) => fn(cmd, arg)),
  onOpenRequest: (fn) => ipcRenderer.on('open-request', (_e, item) => fn(item)),
});
