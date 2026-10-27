// Packaging for the desktop app (`npm run dist`): installers with the app
// icon, file associations and the bookreader:// link protocol.
// https://www.electron.build/configuration
//
// The UI is fully bundled by Vite into out/renderer, so no node_modules are
// shipped — only the Electron shell and the built renderer.
module.exports = {
  appId: 'org.bookreader.app',
  productName: 'BookReader',
  copyright: 'Copyright © BookReader contributors',
  directories: { output: 'dist', buildResources: 'build' },
  // build/icon.png is also used at runtime for the window icon (Windows/Linux) and the About window.
  files: ['electron/**', 'out/renderer/**', 'build/icon.png', 'package.json'],
  fileAssociations: [{ ext: 'pdf', name: 'PDF Document', role: 'Viewer', mimeType: 'application/pdf' }],
  protocols: [{ name: 'BookReader Link', schemes: ['bookreader'] }],
  publish: [{ provider: 'github', releaseType: 'draft' }],
  mac: { category: 'public.app-category.books', target: ['dmg', 'zip'] },
  // The installer window: app icon on the left, an Applications shortcut on the
  // right, and build/background.png (with its arrow) behind them.
  dmg: {
    title: 'BookReader',
    background: 'build/background.png',
    iconSize: 112,
    window: { width: 540, height: 380 },
    contents: [
      { x: 150, y: 220, type: 'file' },
      { x: 390, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // Windows: the installer, uninstaller, Start-menu entry and taskbar all use build/icon.png.
  win: { target: ['nsis'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true },
  linux: { target: ['AppImage', 'deb'], category: 'Office' },
};
