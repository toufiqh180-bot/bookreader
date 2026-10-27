'use strict';
/**
 * Application menu. Every item sends a command id to the focused window's
 * renderer (see src/renderer/app/commands.js), so menu clicks and keyboard
 * shortcuts run exactly the same code.
 */
const { Menu, shell } = require('electron');

const isMac = process.platform === 'darwin';
const REPO_URL = 'https://github.com/toufiqh180-bot/bookreader';

/** @param {(command: string, arg?: string) => void} send */
function buildMenu(send) {
  const item = (label, accelerator, command, arg) => ({ label, accelerator, click: () => send(command, arg) });

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        item('Open…', 'CmdOrCtrl+O', 'file.open'),
        item('Library', 'CmdOrCtrl+L', 'file.library'),
        { type: 'separator' },
        item('Close Tab', 'CmdOrCtrl+W', 'file.closeTab'),
        { type: 'separator' },
        {
          label: 'Export Annotations',
          submenu: [
            item('As Markdown…', null, 'export.annotations', 'md'),
            item('As JSON…', null, 'export.annotations', 'json'),
            item('As Plain Text…', null, 'export.annotations', 'txt'),
          ],
        },
        item('Save Flattened PDF (annotations burned in)…', 'CmdOrCtrl+Shift+S', 'export.flattened'),
        item('Save Searchable PDF (with OCR text)…', null, 'export.searchable'),
        { type: 'separator' },
        item('Copy Link to This Spot', 'CmdOrCtrl+Shift+C', 'nav.copyLink'),
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'CmdOrCtrl+Z', 'edit.undo'),
        item('Redo', 'Shift+CmdOrCtrl+Z', 'edit.redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find in Book…', 'CmdOrCtrl+F', 'nav.find'),
        item('Go to Page…', 'CmdOrCtrl+G', 'nav.goToPage'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Toggle Sidebar', 'CmdOrCtrl+B', 'view.toggleSidebar'),
        { type: 'separator' },
        item('Zoom In', 'CmdOrCtrl+=', 'view.zoomIn'),
        item('Zoom Out', 'CmdOrCtrl+-', 'view.zoomOut'),
        item('Fit Page', 'CmdOrCtrl+0', 'view.fitPage'),
        item('Fit Width', 'CmdOrCtrl+9', 'view.fitWidth'),
        { type: 'separator' },
        item('Toggle Continuous Scroll / Page Mode', 'CmdOrCtrl+M', 'view.toggleMode'),
        item('Two-Page Spread', 'CmdOrCtrl+2', 'view.mode', 'two-page'),
        item('Reflow (Text) View', 'CmdOrCtrl+R', 'view.toggleReflow'),
        item('Smart Margin Crop', 'CmdOrCtrl+K', 'view.toggleCrop'),
        item('Split Screen', 'CmdOrCtrl+\\', 'view.toggleSplit'),
        { type: 'separator' },
        item('Cycle Theme', null, 'view.cycleTheme'),
        item('Auto-Scroll', 'CmdOrCtrl+Shift+A', 'view.toggleAutoScroll'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        item('Back', isMac ? 'Cmd+[' : 'Alt+Left', 'nav.back'),
        item('Forward', isMac ? 'Cmd+]' : 'Alt+Right', 'nav.forward'),
        { type: 'separator' },
        item('First Page', null, 'nav.firstPage'),
        item('Last Page', null, 'nav.lastPage'),
        { type: 'separator' },
        item('Toggle Bookmark', 'CmdOrCtrl+D', 'nav.toggleBookmark'),
      ],
    },
    {
      label: 'Tools',
      submenu: [item('Recognize Text (OCR) — This Page', null, 'tools.ocr', 'page'), item('Recognize Text (OCR) — Whole Book', null, 'tools.ocr', 'all')],
    },
    // Deliberately no Cmd+M "Minimize": the shortcut spec assigns it to reading mode.
    { label: 'Window', submenu: [{ role: 'zoom' }, { role: 'close' }] },
    {
      role: 'help',
      submenu: [item('Keyboard Shortcuts', 'CmdOrCtrl+/', 'help.shortcuts'), { label: 'Project Website', click: () => shell.openExternal(REPO_URL) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
