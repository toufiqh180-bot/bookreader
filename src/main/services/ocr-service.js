'use strict';
// Offline OCR using tesseract.js with the bundled English model. Runs in the
// main process (worker thread) so the reader UI stays responsive.
const path = require('path');

// Packaged builds unpack these modules from app.asar (electron-builder.config.js → asarUnpack)
// because worker threads and wasm cannot be loaded from inside an asar archive.
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    const tessDir = path.dirname(require.resolve('tesseract.js/package.json'));
    const eng = require('@tesseract.js-data/eng');
    workerPromise = createWorker('eng', 1, {
      workerPath: unpacked(path.join(tessDir, 'src', 'worker-script', 'node', 'index.js')),
      langPath: unpacked(path.join(path.dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0_best_int')),
      gzip: eng.gzip,
      cacheMethod: 'none',
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Returns recognized words with pixel bounding boxes, grouped into lines.
async function recognize(png) {
  const worker = await getWorker();
  const { data } = await worker.recognize(png, {}, { blocks: true, text: false });
  const lines = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words = (line.words || [])
          .filter((w) => w.text && w.text.trim() && w.confidence > 30)
          .map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
        if (words.length) lines.push({ words, paragraphEnd: line === para.lines[para.lines.length - 1] });
      }
    }
  }
  return lines;
}

module.exports = { recognize };
