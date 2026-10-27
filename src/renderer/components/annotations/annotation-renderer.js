/**
 * Draws a page's annotations and search hits into its SVG overlay group.
 * The group's transform maps PDF user space to the page, so everything here
 * is in PDF units (y grows upward).
 */
import { toBox, smoothPath, squigglyPath } from '../../lib/geometry.js';
import { svgEl } from '../common/dom.js';

const FLASH_DURATION_MS = 1800;
const COMMENT_DOT_RADIUS = 3;

// A speech-bubble pin, 18×19 units, drawn downward from its top-left corner.
const NOTE_PIN_PATH = 'M2 0h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7l-5 4v-4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z';

/**
 * @param {import('../reader/page-view.js').PageView} pv
 * @param {Array<{ rect: import('../../lib/geometry.js').PdfRect, current: boolean }>} searchHits
 */
export function drawPageOverlay(pv, searchHits = []) {
  const group = pv.overlayGroup;
  group.replaceChildren();
  for (const annotation of pv.book.annotations.onPage(pv.pageNumber)) group.append(renderAnnotation(annotation));
  if (searchHits.length) {
    const hits = svgEl('g', { class: 'search-hits' });
    for (const { rect, current } of searchHits) {
      const b = toBox(rect);
      hits.append(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: current ? 'search-hit current' : 'search-hit' }));
    }
    group.append(hits);
  }
}

/** Outlines rectangles briefly to show where a jump landed. */
export function flashRects(pv, rects) {
  const group = svgEl('g', { class: 'flash' });
  for (const rect of rects) {
    const b = toBox(rect);
    group.append(svgEl('rect', { x: b.x - 2, y: b.y - 2, width: b.w + 4, height: b.h + 4, rx: 2 }));
  }
  pv.overlayGroup.append(group);
  setTimeout(() => group.remove(), FLASH_DURATION_MS);
}

/** @param {import('../../models/annotation-store.js').Annotation} a */
function renderAnnotation(a) {
  const group = svgEl('g', { class: `annot annot-${a.type}`, 'data-id': a.id });
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'squiggly':
    case 'strikeout':
      renderMarkup(group, a);
      break;
    case 'freehand':
      renderInk(group, a);
      break;
    case 'note':
      renderNotePin(group, a);
      break;
  }
  return group;
}

function renderMarkup(group, a) {
  for (const rect of a.rects ?? []) {
    const b = toBox(rect);
    const thickness = Math.max(0.7, b.h * 0.075);
    if (a.type === 'highlight') {
      group.append(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: a.color, class: 'hl' }));
    } else if (a.type === 'underline') {
      group.append(svgEl('line', { x1: b.x, x2: b.x + b.w, y1: b.y + thickness, y2: b.y + thickness, stroke: a.color, 'stroke-width': thickness }));
    } else if (a.type === 'strikeout') {
      const mid = b.y + b.h / 2;
      group.append(svgEl('line', { x1: b.x, x2: b.x + b.w, y1: mid, y2: mid, stroke: a.color, 'stroke-width': thickness }));
    } else {
      group.append(svgEl('path', { d: squigglyPath(b), stroke: a.color, 'stroke-width': thickness * 0.9, fill: 'none' }));
    }
    // An invisible box over the whole line makes thin markups easy to click.
    group.append(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: 'annot-hit' }));
  }
  if (a.comment && a.rects?.length) {
    const first = toBox(a.rects[0]);
    group.append(svgEl('circle', { cx: first.x - 4, cy: first.y + first.h, r: COMMENT_DOT_RADIUS, fill: a.color, class: 'comment-dot annot-hit' }));
  }
}

function renderInk(group, a) {
  const width = a.strokeWidth ?? 2;
  for (const path of a.paths ?? []) {
    const d = smoothPath(path);
    group.append(svgEl('path', { d, stroke: a.color, 'stroke-width': width, class: a.tool === 'marker' ? 'ink marker' : 'ink' }));
    group.append(svgEl('path', { d, 'stroke-width': Math.max(8, width + 6), class: 'annot-hit ink-hit' }));
  }
}

function renderNotePin(group, a) {
  const b = toBox(a.rects[0]);
  // PDF space is y-up; flip so the pin hangs down from its anchor like on screen.
  const pin = svgEl('g', { class: 'note-pin annot-hit', transform: `translate(${b.x} ${b.y + b.h}) scale(1 -1)` });
  pin.append(
    svgEl('path', { d: NOTE_PIN_PATH, fill: a.color, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 0.8 }),
    svgEl('path', { d: 'M4 5h10M4 8.5h7', stroke: 'rgba(0,0,0,.55)', 'stroke-width': 1.2 }),
  );
  group.append(pin);
}
