/**
 * Decides whether a mouse-wheel / trackpad gesture in page-by-page mode means
 * "pan around the page" or "turn the page".
 *
 *  - Page fits the window (not zoomed): a swipe turns the page, once per gesture.
 *  - Zoomed in: two-finger scrolling only ever pans. The one exception is a
 *    deliberate push past an edge: a *new* gesture, clearly along an axis the
 *    page can scroll, that starts with the page already at that edge and
 *    pushes firmly. Momentum from a pan, and the sideways drift every
 *    two-finger pan has, never turn the page.
 *
 * Pure: the caller supplies the event deltas, the scroll state and the time.
 */

export interface ScrollState {
  canScrollX: boolean;
  canScrollY: boolean;
  atLeft: boolean;
  atRight: boolean;
  atTop: boolean;
  atBottom: boolean;
}

export interface WheelDecision {
  /** Swallow the event (don't let it scroll). */
  consume: boolean;
  /** Page to turn to: +1 next, −1 previous, 0 none. */
  turn: -1 | 0 | 1;
}

/** Events further apart than this start a new gesture. */
export const GESTURE_GAP_MS = 220;
/** Accumulated delta needed to turn when the page fits the window. */
export const SWIPE_THRESHOLD = 60;
/** Accumulated push past the edge needed to turn when zoomed in. */
export const EDGE_PUSH_THRESHOLD = 180;
/** A zoomed gesture counts as "along an axis" only when it is this much stronger than the other axis. */
const AXIS_DOMINANCE = 2;

const PAN: WheelDecision = { consume: false, turn: 0 };

export class WheelGesture {
  #lastTime = -Infinity;
  #accumulated = 0;
  /** This gesture may turn the page. */
  #canTurn = false;
  /** This gesture already turned the page. */
  #turned = false;

  handle(deltaX: number, deltaY: number, state: ScrollState, now: number): WheelDecision {
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const delta = horizontal ? deltaX : deltaY;
    if (delta === 0) return PAN;

    if (now - this.#lastTime > GESTURE_GAP_MS) this.#startGesture(horizontal, delta, Math.abs(horizontal ? deltaY : deltaX), state);
    this.#lastTime = now;
    if (!this.#canTurn) return PAN;
    if (this.#turned) return { consume: true, turn: 0 };

    const zoomed = state.canScrollX || state.canScrollY;
    const threshold = zoomed ? EDGE_PUSH_THRESHOLD : SWIPE_THRESHOLD;
    this.#accumulated += delta;
    if (Math.abs(this.#accumulated) < threshold) return { consume: true, turn: 0 };
    this.#turned = true;
    return { consume: true, turn: this.#accumulated > 0 ? 1 : -1 };
  }

  #startGesture(horizontal: boolean, delta: number, crossDelta: number, state: ScrollState): void {
    this.#accumulated = 0;
    this.#turned = false;
    if (!state.canScrollX && !state.canScrollY) {
      this.#canTurn = true; // page fits: any swipe turns
      return;
    }
    // Zoomed: only a clear push along a scrollable axis, starting at its edge.
    const forward = delta > 0;
    const scrollable = horizontal ? state.canScrollX : state.canScrollY;
    const atEdge = horizontal ? (forward ? state.atRight : state.atLeft) : forward ? state.atBottom : state.atTop;
    this.#canTurn = scrollable && atEdge && Math.abs(delta) > crossDelta * AXIS_DOMINANCE;
  }
}

/** Reads a scroll container's state for {@link WheelGesture}. */
export function scrollStateOf(el: {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}): ScrollState {
  const slack = 2; // sub-pixel rounding
  return {
    canScrollX: el.scrollWidth > el.clientWidth + slack,
    canScrollY: el.scrollHeight > el.clientHeight + slack,
    atLeft: el.scrollLeft <= slack,
    atRight: el.scrollLeft + el.clientWidth >= el.scrollWidth - slack,
    atTop: el.scrollTop <= slack,
    atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - slack,
  };
}
