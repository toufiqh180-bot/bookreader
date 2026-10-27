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
  files: ['electron/**', 'out/renderer/**', 'package.json'],
  fileAssociations: [{ ext: 'pdf', name: 'PDF Document', role: 'Viewer', mimeType: 'application/pdf' }],
  protocols: [{ name: 'BookReader Link', schemes: ['bookreader'] }],
  publish: [{ provider: 'github', releaseType: 'draft' }],
  mac: { category: 'public.app-category.books', target: ['dmg', 'zip'] },
  dmg: { title: 'BookReader' },
  win: { target: ['nsis'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true },
  linux: { target: ['AppImage', 'deb'], category: 'Office' },
};
