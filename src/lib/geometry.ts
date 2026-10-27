/** Geometry helpers for annotations (PDF user space unless noted). */
import type { PdfPoint, PdfRect } from '../models/types.ts';

/** Origin + size, with positive extents. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screen-space rectangle (DOMRect-like). */
export interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;

export function toBox(r: PdfRect): Box {
  return { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2), w: Math.abs(r.x2 - r.x1), h: Math.abs(r.y2 - r.y1) };
}

/**
 * Merges glyph boxes (screen space) into one box per text line. Two boxes
 * share a line when they overlap vertically by over half the shorter one.
 */
export function mergeIntoLines(rects: ArrayLike<ScreenRect & { width: number; height: number }>): ScreenRect[] {
  const visible = Array.from(rects)
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: ScreenRect[] = [];
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
 * SVG path data for a smooth stroke, using quadratic curves through segment
 * midpoints (cheap, and it removes mouse jitter).
 */
export function smoothPath(points: PdfPoint[]): string {
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

/** Zig-zag along the bottom of `box`, for squiggly underlines (y grows upward). */
export function squigglyPath(box: Box): string {
  const amplitude = Math.max(0.8, box.h * 0.06);
  const step = amplitude * 2;
  let d = `M${box.x} ${box.y + amplitude}`;
  let up = true;
  for (let x = box.x; x < box.x + box.w; x += step, up = !up) {
    d += ` L${Math.min(x + step, box.x + box.w)} ${up ? box.y + 2 * amplitude : box.y}`;
  }
  return d;
}
