import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, slotFor, looksLikeSpreadScan, isSpread, spreadSlots } from '../../src/lib/page-slots.ts';

const portrait = { w: 600, h: 900 };
const spread = { w: 1400, h: 900 };

test('without splitting, every PDF page is one whole slot', () => {
  const slots = buildSlots([portrait, spread, portrait], false);
  assert.deepEqual(
    slots.map((s) => [s.index, s.pageNumber, s.x0, s.x1]),
    [
      [1, 1, 0, 1],
      [2, 2, 0, 1],
      [3, 3, 0, 1],
    ],
  );
});

test('splitting turns each spread into left and right halves, keeping portrait pages whole', () => {
  const slots = buildSlots([portrait, spread, spread, portrait], true);
  assert.deepEqual(
    slots.map((s) => [s.index, s.pageNumber, s.x0, s.x1]),
    [
      [1, 1, 0, 1],
      [2, 2, 0, 0.5],
      [3, 2, 0.5, 1],
      [4, 3, 0, 0.5],
      [5, 3, 0.5, 1],
      [6, 4, 0, 1],
    ],
  );
});

test('slotFor picks the half that contains the point', () => {
  const slots = buildSlots([portrait, spread], true);
  assert.equal(slotFor(slots, 2, 0.2).index, 2);
  assert.equal(slotFor(slots, 2, 0.8).index, 3);
  assert.equal(slotFor(slots, 2).index, 2, 'defaults to the first half');
  assert.equal(slotFor(slots, 1, 0.9).index, 1);
});

test('detects books scanned as open spreads, ignoring the covers', () => {
  assert.equal(looksLikeSpreadScan([portrait, spread, spread, spread, spread, portrait]), true);
  assert.equal(looksLikeSpreadScan([portrait, portrait, portrait, spread, portrait, portrait]), false);
  assert.equal(looksLikeSpreadScan([]), false);
});

test('a page counts as a spread only when clearly landscape', () => {
  assert.equal(isSpread({ w: 612, h: 792 }), false);
  assert.equal(isSpread({ w: 792, h: 612 }), true);
  assert.equal(isSpread({ w: 100, h: 95 }), false);
});

test('spreads pair like a printed book: cover alone, then even–odd pairs', () => {
  const slots = buildSlots(Array(6).fill(portrait), false);
  assert.deepEqual(spreadSlots(1, 'two-page', slots), [1]);
  assert.deepEqual(spreadSlots(3, 'two-page', slots), [2, 3]);
  assert.deepEqual(spreadSlots(6, 'two-page', slots), [6]);
  assert.deepEqual(spreadSlots(4, 'single', slots), [4]);
});

test('with split scans, the two halves of a scan are shown together', () => {
  const slots = buildSlots([portrait, spread, spread], true); // slots: 1 | 2,3 | 4,5
  assert.deepEqual(spreadSlots(1, 'two-page', slots), [1]);
  assert.deepEqual(spreadSlots(3, 'two-page', slots), [2, 3]);
  assert.deepEqual(spreadSlots(4, 'two-page', slots), [4, 5]);
});
