'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const library = require('./library');

const APP_ROOT = path.join(__dirname, '..', '..');
const PROTOCOL = 'bookreader';
const isMac = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow = null;
// Files / links requested before the window was ready.
const pendingOpens = [];

function queueOpen(item) {
  if (!mainWindow && app.isReady()) createWindow();
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-request', item);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingOpens.push(item);
  }
}

function handleArgv(argv) {
  for (const arg of argv.slice(app.isPackaged ? 1 : 2)) {
    if (arg.startsWith(`${PROTOCOL}://`)) {
      queueOpen({ type: 'link', url: arg });
    } else if (arg.toLowerCase().endsWith('.pdf') && fs.existsSync(arg)) {
      queueOpen({ type: 'file', path: path.resolve(arg) });
    }
  }
}

// ---- Single instance + OS integration -------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => handleArgv(argv));
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueOpen({ type: 'file', path: filePath });
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  queueOpen({ type: 'link', url });
});

// ---- Window ----------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: 'BookReader',
    backgroundColor: '#1e1f22',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.loadURL('app://bundle/src/renderer/index.html');
  mainWindow.webContents.on('did-finish-load', () => {
    while (pendingOpens.length) mainWindow.webContents.send('open-request', pendingOpens.shift());
  });
  // External links in PDFs open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

// ---- Menu ------------------------------------------------------------------
function send(cmd, arg) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win) win.webContents.send('command', cmd, arg);
}

function buildMenu() {
  const item = (label, accelerator, cmd, arg) => ({ label, accelerator, click: () => send(cmd, arg) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        item('Open…', 'CmdOrCtrl+O', 'open'),
        item('Library', 'CmdOrCtrl+L', 'library'),
        { type: 'separator' },
        item('Close Tab', 'CmdOrCtrl+W', 'close-tab'),
        { type: 'separator' },
        {
          label: 'Export Annotations',
          submenu: [
            item('As Markdown…', null, 'export', 'md'),
            item('As JSON…', null, 'export', 'json'),
            item('As Plain Text…', null, 'export', 'txt'),
          ],
        },
        item('Save Flattened PDF (annotations burned in)…', 'CmdOrCtrl+Shift+S', 'flatten'),
        item('Save Searchable PDF (with OCR text)…', null, 'save-ocr-pdf'),
        { type: 'separator' },
        item('Copy Link to This Spot', 'CmdOrCtrl+Shift+C', 'copy-link'),
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'CmdOrCtrl+Z', 'undo'),
        item('Redo', 'Shift+CmdOrCtrl+Z', 'redo'),
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        item('Find in Book…', 'CmdOrCtrl+F', 'find'),
        item('Go to Page…', 'CmdOrCtrl+G', 'goto'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Toggle Sidebar', 'CmdOrCtrl+B', 'sidebar'),
        { type: 'separator' },
        item('Zoom In', 'CmdOrCtrl+=', 'zoom-in'),
        item('Zoom Out', 'CmdOrCtrl+-', 'zoom-out'),
        item('Fit Page', 'CmdOrCtrl+0', 'zoom-fit'),
        item('Fit Width', 'CmdOrCtrl+9', 'zoom-width'),
        { type: 'separator' },
        item('Toggle Continuous Scroll / Page Mode', 'CmdOrCtrl+M', 'toggle-mode'),
        item('Two-Page Spread', 'CmdOrCtrl+2', 'mode', 'spread'),
        item('Reflow (Text) View', 'CmdOrCtrl+R', 'reflow'),
        item('Smart Margin Crop', 'CmdOrCtrl+K', 'crop'),
        item('Split Screen', 'CmdOrCtrl+\\', 'split'),
        { type: 'separator' },
        item('Cycle Theme', null, 'theme-cycle'),
        item('Auto-Scroll', 'CmdOrCtrl+Shift+A', 'autoscroll'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        item('Back', isMac ? 'Cmd+[' : 'Alt+Left', 'back'),
        item('Forward', isMac ? 'Cmd+]' : 'Alt+Right', 'forward'),
        { type: 'separator' },
        item('Add Bookmark', 'CmdOrCtrl+D', 'bookmark'),
      ],
    },
    {
      label: 'Tools',
      submenu: [
        item('Recognize Text (OCR) — This Page', null, 'ocr', 'page'),
        item('Recognize Text (OCR) — Whole Book', null, 'ocr', 'all'),
      ],
    },
    // Note: no Cmd+M minimize — that shortcut toggles reading mode, per spec.
    { label: 'Window', submenu: [{ role: 'zoom' }, { role: 'close' }] },
    {
      role: 'help',
      submenu: [
        item('Keyboard Shortcuts', 'CmdOrCtrl+/', 'shortcuts'),
        { label: 'Project on GitHub', click: () => shell.openExternal('https://github.com/') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC -------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('dialog:open', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('file:read', async (_e, filePath) => {
    const buf = await fsp.readFile(filePath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return { data: new Uint8Array(buf), bookId: `sha256-${hash.slice(0, 24)}`, name: path.basename(filePath), path: filePath };
  });

  ipcMain.handle('file:exists', (_e, p) => fs.existsSync(p));

  ipcMain.handle('book:load', (_e, bookId) => library.loadBook(bookId));
  ipcMain.handle('book:save', (_e, bookId, data) => library.saveBook(bookId, data));
  ipcMain.handle('book:loadExtra', (_e, bookId, kind) => library.loadExtra(bookId, kind));
  ipcMain.handle('book:saveExtra', (_e, bookId, kind, data) => library.saveExtra(bookId, kind, data));
  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:remove', (_e, bookId) => library.remove(bookId));
  ipcMain.handle('library:setCover', (_e, bookId, dataUrl) => library.setCover(bookId, dataUrl));
  ipcMain.handle('prefs:load', () => library.loadPrefs());
  ipcMain.handle('prefs:save', (_e, prefs) => library.savePrefs(prefs));

  ipcMain.handle('export:text', async (_e, { defaultName, content, ext }) => {
    const filters = { md: 'Markdown', json: 'JSON', txt: 'Text' };
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: filters[ext] || 'File', extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, content, 'utf8');
    return r.filePath;
  });

  ipcMain.handle('pdf:flatten', async (_e, { sourcePath, annotations, ocr, defaultName }) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const { flattenPdf } = require('./flatten');
    const bytes = await flattenPdf(await fsp.readFile(sourcePath), annotations, ocr);
    await fsp.writeFile(r.filePath, bytes);
    return r.filePath;
  });

  ipcMain.handle('ocr:recognize', async (_e, pngBytes) => {
    const { recognize } = require('./ocr');
    return recognize(Buffer.from(pngBytes));
  });

  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(text));
  ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('app:info', () => ({ platform: process.platform, version: app.getVersion() }));
  ipcMain.on('window:title', (_e, title) => mainWindow && mainWindow.setTitle(title));
}

// ---- Lifecycle -------------------------------------------------------------
app.whenReady().then(() => {
  // Serve the app (and node_modules assets such as the pdf.js worker) from a
  // privileged custom scheme so ES modules and workers load cleanly from asar.
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(APP_ROOT, decodeURIComponent(pathname)));
    if (!filePath.startsWith(APP_ROOT)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  library.init(app.getPath('userData'));
  registerIpc();
  buildMenu();
  createWindow();
  handleArgv(process.argv);
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
