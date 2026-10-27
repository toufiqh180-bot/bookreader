import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTextFromPdfItems, pageTextFromOcr, rectsForRange } from '../../src/lib/page-text.ts';

test('joins items into one string with newlines at line ends', () => {
  const text = pageTextFromPdfItems([
    { str: 'Clean ', transform: [10, 0, 0, 10, 0, 0], width: 30, height: 10 },
    { str: 'Code', transform: [10, 0, 0, 10, 30, 0], width: 20, height: 10, hasEOL: true },
    { type: 'beginMarkedContent' } as never,
  ]);
  assert.equal(text.str, 'Clean Code\n');
  assert.equal(text.runs.length, 2);
  assert.equal(text.hasText, true);
});

test('pages with only a few characters do not count as having text', () => {
  assert.equal(pageTextFromPdfItems([{ str: '12', transform: [1, 0, 0, 1, 0, 0], width: 5, height: 5 }]).hasText, false);
});

test('maps a character range to a proportional rectangle within a run', () => {
  const text = pageTextFromPdfItems([{ str: 'abcdefghij', transform: [10, 0, 0, 10, 100, 500], width: 100, height: 10, hasEOL: true }]);
  const [rect] = rectsForRange(text, 2, 5);
  assert.equal(rect.x1, 120);
  assert.equal(rect.x2, 150);
  assert.ok(rect.y1 < 500 && rect.y2 > 500);
});

test('maps ranges across OCR words', () => {
  const text = pageTextFromOcr({
    lines: [
      {
        words: [
          { t: 'one', x1: 0, y1: 0, x2: 30, y2: 10 },
          { t: 'two', x1: 40, y1: 0, x2: 70, y2: 10 },
        ],
      },
    ],
  });
  assert.equal(text.str, 'one two\n');
  const rects = rectsForRange(text, 0, 7);
  assert.equal(rects.length, 2);
  assert.deepEqual([rects[1].x1, rects[1].x2], [40, 70]);
});

test('skips rotated runs', () => {
  const text = pageTextFromPdfItems([{ str: 'vertical', transform: [0, 10, -10, 0, 50, 50], width: 80, height: 10 }]);
  assert.deepEqual(rectsForRange(text, 0, 4), []);
});
