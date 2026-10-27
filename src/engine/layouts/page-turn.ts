/**
 * Page-turn transitions for paged reading, modelled on how e-readers and
 * flipbooks animate a physical page:
 *
 *   curl   A leaf pivots on the spine. Its front is the page being turned and
 *          its back is the page that lands on the other side, so in a
 *          two-page spread the next left page arrives on the back of the old
 *          right page, exactly like a book. Shading deepens as the leaf
 *          lifts and the page underneath is revealed progressively.
 *   slide  The new page slides in while the old one slides out.
 *   none   Instant.
 *
 * The caller renders both sheets (old on top, new underneath); this module
 * only arranges a temporary "leaf" and animates it with the Web Animations
 * API, then cleans up. `finish()` jumps to the end (rapid key presses).
 */
import type { PageView } from '../page-view.ts';
import { el } from '../dom.ts';

export type PageTransition = 'curl' | 'slide' | 'none';

export interface TurnRequest {
  stage: HTMLElement;
  from: HTMLElement;
  to: HTMLElement;
  fromViews: PageView[];
  toViews: PageView[];
  /** +1 forward (next page), −1 backward. */
  direction: 1 | -1;
  style: PageTransition;
}

export interface Turn {
  finished: Promise<void>;
  finish(): void;
}

const CURL_MS = 620;
const SLIDE_MS = 320;
const CURL_EASING = 'cubic-bezier(0.45, 0.05, 0.25, 1)';

export function startTurn(request: TurnRequest): Turn {
  if (request.style === 'none') return instant(request);
  // Cover ⇄ spread changes the sheet's width, which a leaf can't model; slide instead.
  if (request.style === 'curl' && request.fromViews.length === request.toViews.length) return curl(request);
  return slide(request);
}

function instant({ from }: TurnRequest): Turn {
  from.remove();
  return { finished: Promise.resolve(), finish: () => {} };
}

/**
 * Resolves when every animation has finished, then cleans up. A timer backs
 * up the animations' own `finished` promises, which never settle while the
 * window is hidden (browsers stop producing animation frames), so a turn
 * started in a background window still completes.
 */
function track(animations: Animation[], durationMs: number, cleanup: () => void): Turn {
  let done = false;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => (resolveFinished = resolve));
  const end = () => {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    cleanup();
    resolveFinished();
  };
  const fallback = setTimeout(end, durationMs + 150);
  void Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(end);
  return {
    finished,
    finish: () => {
      for (const a of animations) a.finish();
      end();
    },
  };
}

// ---- Slide ----------------------------------------------------------------

function slide({ from, to, direction }: TurnRequest): Turn {
  const offset = `${direction * 6}%`;
  const options: KeyframeAnimationOptions = { duration: SLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' };
  const out = from.animate(
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(-${offset})`, opacity: 0 },
    ],
    options,
  );
  const into = to.animate(
    [
      { transform: `translateX(${offset})`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    options,
  );
  return track([out, into], SLIDE_MS, () => {
    from.remove();
    into.cancel();
  });
}

// ---- Curl -----------------------------------------------------------------

/**
 * A copy of a rendered page for the back of the leaf. Canvases don't clone
 * their pixels, so they're copied by hand; interactive layers are dropped.
 */
function snapshot(view: PageView | undefined, size: { w: number; h: number }): HTMLElement {
  if (!view) return el('div', { class: 'turn-paper' });
  const copy = view.el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.textLayer, .link-layer').forEach((n) => n.remove());
  const sources = view.el.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((canvas, i) => {
    const source = sources[i];
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
  });
  Object.assign(copy.style, { width: `${size.w}px`, height: `${size.h}px` });
  return copy;
}

function curl({ from, fromViews, toViews, direction }: TurnRequest): Turn {
  const spread = fromViews.length === 2;
  const sheetBox = from.getBoundingClientRect();

  // Which page physically turns, what's printed on its back, and where it pivots.
  let moving: PageView;
  let front: HTMLElement;
  let back: HTMLElement;
  let pivot: 'left' | 'right';
  let fromAngle: number;
  let toAngle: number;
  let leaveHole = true;

  if (spread) {
    moving = direction > 0 ? fromViews[1] : fromViews[0];
    const box = moving.el.getBoundingClientRect();
    front = moving.el;
    back = snapshot(direction > 0 ? toViews[0] : toViews[1], { w: box.width, h: box.height });
    pivot = direction > 0 ? 'left' : 'right';
    fromAngle = 0;
    toAngle = direction > 0 ? -180 : 180;
  } else if (direction > 0) {
    // Single page forward: the page lifts from its outer edge and turns over.
    moving = fromViews[0];
    front = moving.el;
    back = el('div', { class: 'turn-paper' });
    pivot = 'left';
    fromAngle = 0;
    toAngle = -180;
  } else {
    // Single page backward: the previous page turns back over onto this one.
    moving = fromViews[0];
    const box = moving.el.getBoundingClientRect();
    front = snapshot(toViews[0], { w: box.width, h: box.height });
    back = el('div', { class: 'turn-paper' });
    pivot = 'left';
    fromAngle = -180;
    toAngle = 0;
    leaveHole = false;
  }

  const box = moving.el.getBoundingClientRect();
  const frontFace = el('div', { class: 'turn-face turn-front' }, [front, el('div', { class: 'turn-shade' })]);
  const backFace = el('div', { class: 'turn-face turn-back' }, [back, el('div', { class: 'turn-shade' })]);
  const leaf = el('div', { class: 'turn-leaf' }, [frontFace, backFace]);
  Object.assign(leaf.style, {
    left: `${box.left - sheetBox.left}px`,
    top: `${box.top - sheetBox.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    transformOrigin: `${pivot} center`,
  });

  // A transparent hole where the turning page was reveals the new page beneath.
  const hole = el('div', { class: 'turn-hole' });
  Object.assign(hole.style, { width: `${box.width}px`, height: `${box.height}px` });
  if (leaveHole) moving.el.replaceWith(hole);
  from.classList.add('turning');
  from.append(leaf);

  const timing: KeyframeAnimationOptions = { duration: CURL_MS, easing: CURL_EASING, fill: 'both' };
  const turn = leaf.animate([{ transform: `rotateY(${fromAngle}deg)` }, { transform: `rotateY(${toAngle}deg)` }], timing);
  // The lifting side darkens towards the middle of the turn, like paper catching less light.
  const shade = (face: HTMLElement, keyframes: number[]) =>
    face.querySelector<HTMLElement>('.turn-shade')!.animate(
      keyframes.map((opacity) => ({ opacity })),
      timing,
    );
  const shading =
    fromAngle === 0 ? [shade(frontFace, [0, 0.35, 0.5]), shade(backFace, [0.5, 0.25, 0])] : [shade(frontFace, [0.5, 0.25, 0]), shade(backFace, [0, 0.35, 0.5])];
  // In single-page forward turns the leaf leaves the page area; fade it as it lands.
  const exit = !spread && direction > 0 ? [leaf.animate([{ opacity: 1, offset: 0.7 }, { opacity: 0 }], timing)] : [];

  return track([turn, ...shading, ...exit], CURL_MS, () => {
    leaf.remove();
    from.remove();
  });
}
