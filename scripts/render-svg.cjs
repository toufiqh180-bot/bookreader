// Renders SVG artwork to PNG with Electron's Chromium, so icons look exactly
// as designed on any OS. Used by generate-icons.cjs; run via Electron:
//   electron scripts/render-svg.cjs <in.svg> <out.png> <width> <height> [<in> <out> <w> <h> …]
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.dock?.hide();

/** Canvas size of an SVG file, from its root `width`/`height` attributes. */
function intrinsicSize(svgPath) {
  const root = /<svg[^>]*>/.exec(fs.readFileSync(svgPath, 'utf8'))?.[0] ?? '';
  const read = (name) => Number(new RegExp(`\\s${name}="(\\d+(?:\\.\\d+)?)"`).exec(root)?.[1]);
  const size = { width: read('width'), height: read('height') };
  if (!size.width || !size.height) throw new Error(`${svgPath}: the <svg> element needs numeric width and height attributes`);
  return size;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

// Each SVG is captured at its full canvas size, then scaled down (Chromium
// can't zoom below 25%, so small icons are made by resizing the capture).
// One offscreen window is reused for every job: creating and destroying one
// per file makes Chromium abort the next load.
async function renderAll(jobs) {
  // In-memory session: Chromium would otherwise remember zoom levels between runs.
  const win = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true, partition: 'render-svg' },
  });
  for (const [index, { input, output, width, height }] of jobs.entries()) {
    const canvas = intrinsicSize(input);
    win.setContentSize(canvas.width, canvas.height);
    await win.loadFile(path.resolve(input), { query: { job: String(index) } });
    win.webContents.setZoomFactor(1);
    await settle();
    const image = await win.webContents.capturePage({ x: 0, y: 0, ...canvas });
    fs.writeFileSync(output, image.resize({ width, height, quality: 'best' }).toPNG());
    console.log(`${output} (${width}×${height})`);
  }
  win.destroy();
}

app.whenReady().then(async () => {
  // argv: [electron, this script, ...jobs]
  const args = process.argv.slice(2);
  const jobs = [];
  for (let i = 0; i + 3 < args.length; i += 4) jobs.push({ input: args[i], output: args[i + 1], width: Number(args[i + 2]), height: Number(args[i + 3]) });
  try {
    await renderAll(jobs);
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
