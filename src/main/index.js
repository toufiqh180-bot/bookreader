'use strict';
/**
 * Electron main process entry point.
 *
 *   - single-instance lock: opening a PDF or deep link while the app is
 *     running routes it to the existing window
 *   - OS integration: file associations (open-file), the bookreader://
 *     protocol (open-url / argv)
 *   - serves the renderer from a privileged app:// scheme so ES modules and
 *     the pdf.js worker load the same way in development and inside app.asar
 */
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { buildMenu } = require('./menu');
const { registerIpc } = require('./ipc');
const libraryStore = require('./services/library-store');

const APP_ROOT = path.join(__dirname, '..', '..');
const ENTRY_URL = 'app://bundle/src/renderer/index.html';
const DEEP_LINK_SCHEME = 'bookreader';
const isMac = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

/** @type {BrowserWindow|null} */
let mainWindow = null;

// ---- Open requests (files and deep links) -----------------------------------
// Requests can arrive before the window exists (e.g. double-clicking a PDF
// launches the app), so they are queued until the renderer reports that it
// has finished starting up ('renderer:ready').

/** @typedef {{ type: 'file', path: string } | { type: 'link', url: string }} OpenRequest */
/** @type {OpenRequest[]} */
const pendingRequests = [];
let rendererReady = false;

/** @param {OpenRequest} request */
function deliverOpenRequest(request) {
  if (!mainWindow && app.isReady()) createWindow();
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send('open-request', request);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingRequests.push(request);
  }
}

function handleCommandLine(argv) {
  // argv = [electron, (script in dev), ...args]
  for (const arg of argv.slice(app.isPackaged ? 1 : 2)) {
    if (arg.startsWith(`${DEEP_LINK_SCHEME}://`)) {
      deliverOpenRequest({ type: 'link', url: arg });
    } else if (arg.toLowerCase().endsWith('.pdf') && fs.existsSync(arg)) {
      deliverOpenRequest({ type: 'file', path: path.resolve(arg) });
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => handleCommandLine(argv));
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  deliverOpenRequest({ type: 'file', path: filePath });
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  deliverOpenRequest({ type: 'link', url });
});

// ---- Window -------------------------------------------------------------------

function openExternally(url) {
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: 'BookReader',
    backgroundColor: '#1e1f22',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  rendererReady = false;
  mainWindow.loadURL(ENTRY_URL);
  mainWindow.webContents.on('did-start-loading', () => (rendererReady = false));
  // Links inside PDFs open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://')) return;
    event.preventDefault();
    openExternally(url);
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

/** Sends a menu command to the focused window. */
function sendCommand(command, arg) {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
  target?.webContents.send('command', command, arg);
}

// Serves files under the app root; refuses anything that escapes it.
function serveAppProtocol() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(APP_ROOT, decodeURIComponent(pathname)));
    if (!filePath.startsWith(APP_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

ipcMain.on('renderer:ready', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  rendererReady = true;
  for (const request of pendingRequests.splice(0)) mainWindow.webContents.send('open-request', request);
});

// ---- Lifecycle ----------------------------------------------------------------

app.whenReady().then(() => {
  serveAppProtocol();
  libraryStore.init(app.getPath('userData'));
  registerIpc();
  buildMenu(sendCommand);
  createWindow();
  handleCommandLine(process.argv);
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
