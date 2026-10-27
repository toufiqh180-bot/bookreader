import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, toPlainText, toJson, inReadingOrder } from '../../src/renderer/lib/export-format.js';

const record = {
  bookId: 'isbn-978-0132350884',
  fileName: 'clean_code.pdf',
  annotations: [
    { id: 'a2', type: 'freehand', page: 43, color: '#FF5722', paths: [[{ x: 1, y: 1 }]] },
    {
      id: 'a1',
      type: 'highlight',
      page: 42,
      color: '#FFEB3B',
      textQuoted: 'Functions should do one thing.',
      rects: [{ x1: 72, y1: 410, x2: 450, y2: 425 }],
      comment: 'Core rule.',
    },
    { id: 'a0', type: 'underline', page: 42, color: '#64B5F6', textQuoted: 'Higher on the page', rects: [{ x1: 72, y1: 700, x2: 300, y2: 712 }] },
  ],
  bookmarks: [{ id: 'b1', page: 15, title: 'Chapter 2: Meaningful Names' }],
};
const fixedDate = new Date('2026-10-27T06:00:00Z');

test('orders by page, then top to bottom', () => {
  assert.deepEqual(
    inReadingOrder(record.annotations).map((a) => a.id),
    ['a0', 'a1', 'a2'],
  );
});

test('markdown groups by page and includes quotes, comments and bookmarks', () => {
  const md = toMarkdown(record, String, fixedDate);
  assert.match(md, /^# Notes — clean_code\.pdf/);
  assert.match(md, /- \*\*p\. 15\*\* — Chapter 2: Meaningful Names/);
  assert.match(md, /### Page 42\n\n- \*\*Underline\*\*/);
  assert.match(md, /> Functions should do one thing\.\n {2}- Core rule\./);
  assert.match(md, /### Page 43\n\n- \*\*Drawing\*\* \(#FF5722\) — 1 stroke\(s\)/);
});

test('plain text lists each annotation with its page', () => {
  const txt = toPlainText(record, String, fixedDate);
  assert.match(txt, /\[p\. 42\] Highlight: "Functions should do one thing\."\n {6}Core rule\./);
});

test('json is the full record', () => {
  assert.deepEqual(JSON.parse(toJson(record)), record);
});
