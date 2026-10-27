import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphsFromLines, joinLine, linesFromPageText } from '../../src/renderer/lib/reflow-text.js';
import { pageTextFromPdfItems, pageTextFromOcr } from '../../src/renderer/lib/page-text.js';

const PAGE_H = 800;
// A body line at baseline y, starting at x, of the given width (font size 10).
const line = (text, y, { x = 72, width = 400, size = 10 } = {}) => ({ text, x, right: x + width, y, size });

test('consecutive lines with normal spacing form one paragraph', () => {
  const paras = paragraphsFromLines([line('The quick brown fox', 700), line('jumps over the lazy dog.', 688)], PAGE_H);
  assert.equal(paras.length, 1);
  assert.equal(paras[0].text, 'The quick brown fox jumps over the lazy dog.');
});

test('a larger vertical gap starts a new paragraph', () => {
  const paras = paragraphsFromLines([line('First line', 700), line('continues here.', 688), line('Second paragraph', 660), line('goes on.', 648)], PAGE_H);
  assert.deepEqual(
    paras.map((p) => p.text),
    ['First line continues here.', 'Second paragraph goes on.'],
  );
});

test('a short line ending a sentence closes the paragraph', () => {
  const paras = paragraphsFromLines([line('Long body line text', 700), line('ends.', 688, { width: 60 }), line('Next starts', 676), line('here', 664)], PAGE_H);
  assert.equal(paras.length, 2);
});

test('larger text becomes a heading', () => {
  const paras = paragraphsFromLines([line('Chapter One', 740, { size: 18 }), line('Body text', 700), line('more body', 688), line('and more', 676)], PAGE_H);
  assert.equal(paras[0].heading, true);
  assert.equal(paras[0].text, 'Chapter One');
  assert.equal(paras[1].heading, false);
});

test('bare page numbers at the page edge are dropped', () => {
  const paras = paragraphsFromLines([line('Body text here', 700), line('42', 30, { width: 12 })], PAGE_H);
  assert.deepEqual(
    paras.map((p) => p.text),
    ['Body text here'],
  );
});

test('hyphenated words are re-joined across line breaks', () => {
  assert.equal(joinLine('an exam-', 'ple of this'), 'an example of this');
  assert.equal(joinLine('well-', 'Known'), 'well- Known'); // capitalised: keep the hyphen
});

test('native pdf.js items become lines', () => {
  const items = [
    { str: 'Hello ', transform: [10, 0, 0, 10, 72, 700], width: 30, height: 10, hasEOL: false },
    { str: 'world', transform: [10, 0, 0, 10, 102, 700], width: 25, height: 10, hasEOL: true },
    { str: 'Second line', transform: [10, 0, 0, 10, 72, 688], width: 60, height: 10, hasEOL: true },
  ];
  const lines = linesFromPageText(pageTextFromPdfItems(items));
  assert.deepEqual(
    lines.map((l) => l.text),
    ['Hello world', 'Second line'],
  );
});

test('OCR words become lines and keep paragraph ends', () => {
  const word = (t, x1, y1) => ({ t, x1, y1, x2: x1 + 30, y2: y1 + 10 });
  const ocr = { lines: [{ words: [word('Scanned', 72, 700), word('text', 110, 700)], pe: true }, { words: [word('Next', 72, 680)] }] };
  const lines = linesFromPageText(pageTextFromOcr(ocr));
  assert.deepEqual(
    lines.map((l) => l.text),
    ['Scanned text', 'Next'],
  );
  assert.equal(lines[0].paragraphEnd, true);
});
