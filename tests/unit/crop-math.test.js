import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkBounds, samplePages, cropFromSamples } from '../../src/renderer/lib/crop-math.js';

/** White RGBA image with a black rectangle. */
function image(width, height, ink) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  if (ink) {
    for (let y = ink.y0; y < ink.y1; y++) for (let x = ink.x0; x < ink.x1; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  return data;
}

test('finds the ink bounding box as page fractions', () => {
  const box = inkBounds(image(100, 200, { x0: 20, y0: 40, x1: 80, y1: 160 }), 100, 200);
  assert.deepEqual(box, { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 });
});

test('a blank page has no ink', () => {
  assert.equal(inkBounds(image(50, 50), 50, 50), null);
});

test('samples are spread across the book and skip the covers', () => {
  const pages = samplePages(300, 10);
  assert.equal(pages.length, 10);
  assert.ok(pages[0] >= 3);
  assert.ok(pages.at(-1) <= 298);
  assert.deepEqual(samplePages(3), [1, 2, 3]);
});

test('odd and even pages get separate, padded crops', () => {
  const samples = [];
  for (let p = 1; p <= 20; p++) {
    const box = p % 2 ? { x0: 0.15, y0: 0.1, x1: 0.75, y1: 0.9 } : { x0: 0.25, y0: 0.1, x1: 0.85, y1: 0.9 };
    samples.push({ page: p, box });
  }
  const crop = cropFromSamples(samples);
  assert.ok(crop.odd.x < 0.15 && crop.odd.x > 0.1);
  assert.ok(crop.even.x < 0.25 && crop.even.x > 0.2);
  assert.ok(Math.abs(crop.odd.w - crop.even.w) < 1e-9);
});

test('one full-bleed outlier does not defeat the crop', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ page: i * 2 + 1, box: { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 } }));
  samples.push({ page: 41, box: { x0: 0, y0: 0, x1: 1, y1: 1 } });
  const { odd } = cropFromSamples(samples);
  assert.ok(odd.x > 0.15);
});

test('returns null when no page has content', () => {
  assert.equal(cropFromSamples([{ page: 1, box: null }]), null);
});
