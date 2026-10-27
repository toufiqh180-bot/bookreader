import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeepLink, parseDeepLink } from '../../src/lib/deep-link.ts';

test('round-trips a link to a passage', () => {
  const link = buildDeepLink({ bookId: 'sha256-abc', file: '/Books/Clean Code.pdf', page: 42, endPage: 43, x: 72.4, y: 640.6, x2: 450, y2: 625 });
  assert.match(link, /^bookreader:\/\/open\?/);
  assert.deepEqual(parseDeepLink(link), { bookId: 'sha256-abc', file: '/Books/Clean Code.pdf', page: 42, endPage: 43, x: 72, y: 641, x2: 450, y2: 625 });
});

test('omits optional parts', () => {
  const link = buildDeepLink({ page: 5 });
  assert.equal(link, 'bookreader://open?page=5');
  assert.deepEqual(parseDeepLink(link), { bookId: null, file: null, page: 5, endPage: null, x: null, y: null, x2: null, y2: null });
});

test('rejects other schemes and garbage', () => {
  assert.equal(parseDeepLink('https://example.com/?page=2'), null);
  assert.equal(parseDeepLink('not a url'), null);
});

test('ignores non-numeric coordinates', () => {
  assert.equal(parseDeepLink('bookreader://open?page=3&x=abc')!.x, null);
});
