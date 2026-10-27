import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationHistory } from '../../src/lib/history.ts';

const fixedClock = () => '2026-10-27T00:00:00Z';
const at = (page: number, y = 0) => ({ page, x: 0, y });

test('a jump records where you left and where you went', () => {
  const h = new NavigationHistory({ now: fixedClock });
  h.push(at(12, 250), at(310));
  assert.deepEqual(
    h.stack.map((e) => e.page),
    [12, 310],
  );
  assert.equal(h.pointer, 1);
  assert.ok(h.canGoBack);
  assert.ok(!h.canGoForward);
});

test('back returns to the exact previous spot, forward returns again', () => {
  const h = new NavigationHistory({ now: fixedClock });
  h.push(at(12, 250), at(310));
  const back = h.step(at(311, 40), -1);
  assert.deepEqual([back!.page, back!.y], [12, 250]);
  // The spot we left (scrolled a bit after the jump) is what forward restores.
  const forward = h.step(at(12, 250), +1);
  assert.deepEqual([forward!.page, forward!.y], [311, 40]);
});

test('a new jump after going back discards forward entries, like a browser', () => {
  const h = new NavigationHistory({ now: fixedClock });
  h.push(at(1), at(50));
  h.push(at(50), at(100));
  h.step(at(100), -1);
  h.push(at(50), at(7));
  assert.deepEqual(
    h.stack.map((e) => e.page),
    [1, 50, 7],
  );
  assert.ok(!h.canGoForward);
});

test('step returns null at either end', () => {
  const h = new NavigationHistory({ now: fixedClock });
  assert.equal(h.step(at(1), -1), null);
  h.push(at(1), at(2));
  assert.equal(h.step(at(2), +1), null);
});

test('stack is capped at the limit, keeping the newest entries', () => {
  const h = new NavigationHistory({ limit: 3, now: fixedClock });
  for (let p = 1; p <= 5; p++) h.push(at(p), at(p + 1));
  assert.equal(h.stack.length, 3);
  assert.equal(h.stack.at(-1)!.page, 6);
  assert.equal(h.pointer, 2);
});

test('round-trips through the stored schema fields', () => {
  const h = new NavigationHistory({ now: fixedClock });
  h.push(at(12, 250), at(310));
  const { navigationStack, stackPointer } = h.toJSON();
  const restored = new NavigationHistory({ stack: navigationStack, pointer: stackPointer, now: fixedClock });
  assert.deepEqual(restored.toJSON(), h.toJSON());
});
