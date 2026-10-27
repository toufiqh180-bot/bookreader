/**
 * Geometry helpers for annotations. All rectangles stored in the book schema
 * are `{x1, y1, x2, y2}` in PDF user space (points, origin bottom-left).
 *
 * @typedef {{ x1: number, y1: number, x2: number, y2: number }} PdfRect
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {{ x: number, y: number }} Point
 */

/** Converts a corner-pair rect to an origin + size box with positive extents. @returns {Box} */
export function toBox(r) {
  return { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2), w: Math.abs(r.x2 - r.x1), h: Math.abs(r.y2 - r.y1) };
}

export const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Merges glyph boxes (DOMRect-like, screen space) into one box per text line.
 * Two boxes are on the same line when they overlap vertically by more than
 * half of the shorter one's height.
 *
 * @param {Array<{left:number,right:number,top:number,bottom:number,width:number,height:number}>} rects
 * @returns {Array<{left:number,right:number,top:number,bottom:number}>}
 */
export function mergeIntoLines(rects) {
  const visible = rects.filter((r) => r.width > 0.5 && r.height > 0.5).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of visible) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
      return overlap > Math.min(l.bottom - l.top, r.bottom - r.top) * 0.5;
    });
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
  }
  return lines;
}

/**
 * SVG path data for a smooth stroke through `points`, using quadratic curves
 * through segment midpoints (cheap, and removes mouse jitter).
 * @param {Point[]} points
 */
export function smoothPath(points) {
  if (!points.length) return '';
  const [first] = points;
  if (points.length === 1) return `M${first.x} ${first.y} l0.1 0`;
  if (points.length === 2) return `M${first.x} ${first.y} L${points[1].x} ${points[1].y}`;
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x} ${last.y}`;
}

/**
 * Zig-zag path along the bottom edge of `box`, for squiggly underlines.
 * Works in PDF space (y up), so the wave sits just above `box.y`.
 * @param {Box} box
 */
export function squigglyPath(box) {
  const amplitude = Math.max(0.8, box.h * 0.06);
  const step = amplitude * 2;
  let d = `M${box.x} ${box.y + amplitude}`;
  let up = true;
  for (let x = box.x; x < box.x + box.w; x += step, up = !up) {
    d += ` L${Math.min(x + step, box.x + box.w)} ${up ? box.y + 2 * amplitude : box.y}`;
  }
  return d;
}
