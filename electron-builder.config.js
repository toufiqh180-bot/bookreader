// Packaging configuration for electron-builder (`npm run dist`).
// https://www.electron.build/configuration
const path = require('path');

/**
 * A package plus everything it depends on, transitively. Tesseract's OCR
 * worker runs as a Node worker thread, which can't load files from inside
 * app.asar, so the worker and all of its dependencies are unpacked to disk.
 */
function dependencyTree(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  const manifest = require(path.join(__dirname, 'node_modules', name, 'package.json'));
  for (const dep of Object.keys(manifest.dependencies ?? {})) dependencyTree(dep, seen);
  return seen;
}

const OCR_PACKAGES = [...dependencyTree('tesseract.js'), '@tesseract.js-data/eng'];

module.exports = {
  appId: 'org.bookreader.app',
  productName: 'BookReader',
  copyright: 'Copyright © BookReader contributors',
  directories: { output: 'dist', buildResources: 'build' },
  files: [
    'src/**/*',
    'package.json',
    'node_modules/**/*',
    '!node_modules/**/{test,tests,__tests__,docs,example,examples}/**',
    '!node_modules/**/*.map',
    // pdf.js: only the modern browser build is used.
    '!node_modules/pdfjs-dist/{legacy,types,image_decoders}/**',
    // Optional Node canvas for pdf.js; not needed inside Electron.
    '!node_modules/@napi-rs/**',
    // Only the compact English model is used (see ocr-service.js).
    '!node_modules/@tesseract.js-data/eng/4.0.0/**',
  ],
  asarUnpack: OCR_PACKAGES.map((name) => `node_modules/${name}/**`),
  fileAssociations: [{ ext: 'pdf', name: 'PDF Document', role: 'Viewer', mimeType: 'application/pdf' }],
  protocols: [{ name: 'BookReader Link', schemes: ['bookreader'] }],
  publish: [{ provider: 'github', releaseType: 'draft' }],
  mac: { category: 'public.app-category.books', target: ['dmg', 'zip'] },
  win: { target: ['nsis', 'portable'] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  linux: { target: ['AppImage', 'deb'], category: 'Office' },
};
