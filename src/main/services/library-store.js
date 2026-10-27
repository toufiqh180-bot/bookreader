'use strict';
/**
 * On-disk storage for the reader's library. Books are keyed by a content
 * hash, so notes follow a file even if it is renamed or moved.
 *
 *   <userData>/preferences.json                app-wide preferences
 *   <userData>/library/<bookId>.json           unified book record (session, annotations, bookmarks)
 *   <userData>/library/<bookId>.<kind>.json    caches: "ocr", "crop"
 *   <userData>/library/covers/<bookId>.jpg     cover thumbnail for the library screen
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

let root = null;

function init(userData) {
  root = path.join(userData, 'library');
  fs.mkdirSync(path.join(root, 'covers'), { recursive: true });
}

// Ids come from the renderer; strip anything that could form a path.
const safe = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
const bookFile = (id) => path.join(root, `${safe(id)}.json`);
const extraFile = (id, kind) => path.join(root, `${safe(id)}.${safe(kind)}.json`);
const coverFile = (id) => path.join(root, 'covers', `${safe(id)}.jpg`);

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

// Write atomically so a crash mid-save never corrupts a reader's notes.
async function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

const loadBook = (id) => readJson(bookFile(id));
const saveBook = (id, data) => writeJson(bookFile(id), data);
const loadExtra = (id, kind) => readJson(extraFile(id, kind));
const saveExtra = (id, kind, data) => writeJson(extraFile(id, kind), data);

async function saveCover(id, dataUrl) {
  const b64 = String(dataUrl).split(',')[1];
  if (b64) await fsp.writeFile(coverFile(id), Buffer.from(b64, 'base64'));
}

async function listBooks() {
  const files = (await fsp.readdir(root)).filter((f) => /^[\w-]+\.json$/.test(f));
  const books = [];
  for (const f of files) {
    const data = await readJson(path.join(root, f));
    if (!data || !data.bookId) continue;
    const cover = await fsp
      .readFile(coverFile(data.bookId))
      .then((jpeg) => `data:image/jpeg;base64,${jpeg.toString('base64')}`)
      .catch(() => null); // no cover saved yet
    books.push({
      bookId: data.bookId,
      fileName: data.fileName,
      filePath: data.filePath,
      exists: !!data.filePath && fs.existsSync(data.filePath),
      lastSaved: data.lastSaved,
      lastPage: data.sessionState?.lastPage || 1,
      pageCount: data.pageCount || 0,
      annotationCount: (data.annotations || []).length,
      cover,
    });
  }
  return books.sort((a, b) => String(b.lastSaved).localeCompare(String(a.lastSaved)));
}

async function removeBook(id) {
  for (const f of [bookFile(id), coverFile(id), extraFile(id, 'ocr'), extraFile(id, 'crop')]) {
    await fsp.rm(f, { force: true });
  }
}

const prefsFile = () => path.join(root, '..', 'preferences.json');
const loadPreferences = async () => (await readJson(prefsFile())) || {};
const savePreferences = (p) => writeJson(prefsFile(), p);

module.exports = { init, loadBook, saveBook, loadExtra, saveExtra, saveCover, listBooks, removeBook, loadPreferences, savePreferences };
