// Regenerates every PNG from the SVG artwork in build/. Run after editing
// the logo:  npm run icons
//
//   build/icon.svg           → build/icon.png (1024; electron-builder derives .icns/.ico from it)
//                            → public/icons/icon-{192,512}.png and icon.svg (favicon)
//   build/icon-maskable.svg  → public/icons/maskable-512.png, apple-touch-icon.png
//   build/dmg-background.svg → build/background.png + background@2x.png (macOS installer window)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const at = (p) => path.join(root, p);
const jobs = [
  ['build/icon.svg', 'build/icon.png', 1024, 1024],
  ['build/icon.svg', 'public/icons/icon-512.png', 512, 512],
  ['build/icon.svg', 'public/icons/icon-192.png', 192, 192],
  ['build/icon-maskable.svg', 'public/icons/maskable-512.png', 512, 512],
  ['build/icon-maskable.svg', 'public/icons/apple-touch-icon.png', 180, 180],
  ['build/dmg-background.svg', 'build/background.png', 540, 380],
  ['build/dmg-background.svg', 'build/background@2x.png', 1080, 760],
];

fs.mkdirSync(at('public/icons'), { recursive: true });
// Launch Electron through its CLI, exactly as `npx electron` does, from the repo root.
const electronCli = require.resolve('electron/cli.js');
const args = jobs.flatMap(([input, output, w, h]) => [input, output, String(w), String(h)]);
execFileSync(process.execPath, [electronCli, 'scripts/render-svg.cjs', ...args], { cwd: root, stdio: 'inherit' });
fs.copyFileSync(at('build/icon.svg'), at('public/icons/icon.svg'));
