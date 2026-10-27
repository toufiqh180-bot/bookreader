// Regenerates every PNG from the SVG artwork in build/. Run after editing the
// logo:  npm run icons
//
//   build/icon.svg           → build/icon.png, public/icons/icon-{192,512}.png, icon.svg (favicon)
//   build/icon-maskable.svg  → public/icons/maskable-512.png, apple-touch-icon.png
//   build/dmg-background.svg → build/background.png + background@2x.png (macOS installer window)
//
// Then the app icon set (.icns, .ico, all sizes) is built from build/icon.png
// by `tauri icon`, see the icons:app script.
//
// Rendered with resvg, a pure Rust SVG renderer, so the output is the same on
// every machine and needs no browser.
'use strict';
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.join(__dirname, '..');
const at = (p) => path.join(root, p);
const jobs = [
  ['build/icon.svg', 'build/icon.png', 1024],
  ['build/icon.svg', 'public/icons/icon-512.png', 512],
  ['build/icon.svg', 'public/icons/icon-192.png', 192],
  ['build/icon-maskable.svg', 'public/icons/maskable-512.png', 512],
  ['build/icon-maskable.svg', 'public/icons/apple-touch-icon.png', 180],
  ['build/dmg-background.svg', 'build/background.png', 540],
  ['build/dmg-background.svg', 'build/background@2x.png', 1080],
];

fs.mkdirSync(at('public/icons'), { recursive: true });
for (const [input, output, width] of jobs) {
  const png = new Resvg(fs.readFileSync(at(input)), { fitTo: { mode: 'width', value: width } }).render().asPng();
  fs.writeFileSync(at(output), png);
  console.log(`${input} → ${output} (${width}px wide)`);
}
fs.copyFileSync(at('build/icon.svg'), at('public/icons/icon.svg'));
