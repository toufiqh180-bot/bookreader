import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WheelGesture, GESTURE_GAP_MS, type ScrollState } from '../../src/lib/wheel-gesture.ts';

const fits: ScrollState = { canScrollX: false, canScrollY: false, atLeft: true, atRight: true, atTop: true, atBottom: true };
const zoomedMiddle: ScrollState = { canScrollX: true, canScrollY: true, atLeft: false, atRight: false, atTop: false, atBottom: false };
const zoomedAtRightEdge: ScrollState = { ...zoomedMiddle, atRight: true };

/** Feeds a continuous gesture (events 16 ms apart) and collects the turns. */
function swipe(gesture: WheelGesture, start: number, events: Array<[dx: number, dy: number]>, state: ScrollState) {
  const turns: number[] = [];
  let consumed = 0;
  events.forEach(([dx, dy], i) => {
    const d = gesture.handle(dx, dy, state, start + i * 16);
    if (d.turn) turns.push(d.turn);
    if (d.consume) consumed++;
  });
  return { turns, consumed };
}

const many = (n: number, dx: number, dy: number) => Array.from({ length: n }, (): [number, number] => [dx, dy]);

test('when the page fits, a swipe turns the page exactly once', () => {
  const g = new WheelGesture();
  assert.deepEqual(swipe(g, 0, many(20, 15, 0), fits).turns, [1]);
  assert.deepEqual(swipe(g, 1000, many(20, -15, 0), fits).turns, [-1]);
});

test('when zoomed in, two-finger panning never turns the page — in any direction', () => {
  const g = new WheelGesture();
  for (const [dx, dy] of [
    [20, 0],
    [-20, 0],
    [0, 20],
    [0, -20],
  ]) {
    const { turns, consumed } = swipe(g, 0, many(40, dx, dy), zoomedMiddle);
    assert.deepEqual(turns, []);
    assert.equal(consumed, 0, 'events are left to scroll the page');
  }
});

test('momentum that carries a pan into the edge does not turn the page', () => {
  const g = new WheelGesture();
  // Starts mid-page, then (same gesture) the content reaches the right edge.
  swipe(g, 0, many(10, 20, 0), zoomedMiddle);
  assert.deepEqual(swipe(g, 160, many(30, 20, 0), zoomedAtRightEdge).turns, []);
});

test('a new, firm push past the edge turns the page when zoomed in', () => {
  const g = new WheelGesture();
  swipe(g, 0, many(10, 20, 0), zoomedMiddle);
  const later = 160 + GESTURE_GAP_MS + 50;
  assert.deepEqual(swipe(g, later, many(4, 20, 0), zoomedAtRightEdge).turns, [], 'a light nudge is not enough');
  assert.deepEqual(swipe(g, later + 1000, many(20, 20, 0), zoomedAtRightEdge).turns, [1]);
});

test('zoomed so only vertical panning is possible, sideways drift never turns the page', () => {
  const g = new WheelGesture();
  const tallOnly: ScrollState = { ...zoomedMiddle, canScrollX: false, atLeft: true, atRight: true };
  assert.deepEqual(swipe(g, 0, many(20, 15, 0), tallOnly).turns, []);
  assert.deepEqual(swipe(g, 1000, many(20, 12, 8), tallOnly).turns, [], 'diagonal pan');
});

test('a diagonal push at the edge is not mistaken for a page turn', () => {
  const g = new WheelGesture();
  const atBottom: ScrollState = { ...zoomedMiddle, atBottom: true };
  assert.deepEqual(swipe(g, 0, many(20, 15, 20), atBottom).turns, []);
});
