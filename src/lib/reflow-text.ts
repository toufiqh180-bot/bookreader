/**
 * Turns positioned page text into paragraphs for the reflow (EPUB-like) view.
 *
 * PDFs have no notion of paragraphs — only lines of glyphs at coordinates —
 * so we rebuild them from typographic cues: a larger vertical gap, a
 * first-line indent, a short line ending in punctuation, a larger font
 * (heading), or a paragraph end reported by OCR. Words hyphenated across a
 * line break are re-joined, and bare page numbers at the page edges dropped.
 */
import { median } from './util.ts';
import type { PageText, TextRun } from './page-text.ts';

export interface Line {
  text: string;
  x: number;
  right: number;
  y: number;
  size: number;
  paragraphEnd?: boolean;
}

export interface Paragraph {
  text: string;
  heading: boolean;
}

/** Groups a page's text runs into visual lines. */
export function linesFromPageText(pageText: PageText): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  const finish = () => {
    if (current?.text.trim()) lines.push(current);
    current = null;
  };
  for (const run of pageText.runs) {
    const geom = runGeometry(run);
    if (!current || Math.abs(geom.y - current.y) > geom.size * 0.6) {
      finish();
      current = { text: '', x: geom.x, right: geom.x, y: geom.y, size: geom.size, paragraphEnd: false };
    }
    const line: Line = current;
    line.text += line.text && run.word ? ` ${run.str}` : run.str;
    line.right = Math.max(line.right, geom.right);
    line.size = Math.max(line.size, geom.size);
    if (run.eol) {
      if (run.word && run.paragraphEnd) line.paragraphEnd = true;
      finish();
    }
  }
  finish();
  return lines;
}

function runGeometry(run: TextRun): { x: number; right: number; y: number; size: number } {
  if (run.word) {
    const { x1, x2, y1, y2 } = run.word;
    return { x: x1, right: x2, y: y1, size: y2 - y1 };
  }
  const [, , , d, x, y] = run.transform ?? [1, 0, 0, 10, 0, 0];
  return { x, right: x + (run.width ?? 0), y, size: Math.abs(run.height || d) || 10 };
}

const PAGE_NUMBER = /^\s*(page\s+)?[\divxlc]+\s*$/i;
const SENTENCE_END = /[.!?:"”’)]\s*$/;

/** @param pageHeight in PDF units, used to spot headers/footers */
export function paragraphsFromLines(lines: Line[], pageHeight: number): Paragraph[] {
  const isEdge = (l: Line) => l.y > pageHeight * 0.93 || l.y < pageHeight * 0.07;
  const body = lines.filter((l) => !(isEdge(l) && PAGE_NUMBER.test(l.text)));
  if (!body.length) return [];

  const bodySize = median(body.map((l) => l.size));
  const leftEdge = median(body.map((l) => l.x));
  const lineWidth = median(body.map((l) => l.right - l.x));
  const gaps = body
    .slice(1)
    .map((l, i) => Math.abs(body[i].y - l.y))
    .filter((g) => g > 0);
  const lineGap = median(gaps) || bodySize * 1.2;

  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  body.forEach((line, i) => {
    const prev = body[i - 1];
    const heading = line.size > bodySize * 1.25 && line.text.length < 120;
    const bigGap = prev && Math.abs(prev.y - line.y) > lineGap * 1.45;
    const indent = line.x - leftEdge > bodySize * 1.2 && line.x - leftEdge < lineWidth * 0.3;
    const prevEndsShort = prev && prev.right - prev.x < lineWidth * 0.8 && SENTENCE_END.test(prev.text);

    if (!current || heading || current.heading || bigGap || indent || prevEndsShort || prev?.paragraphEnd) {
      current = { text: '', heading };
      paragraphs.push(current);
    }
    current.text = joinLine(current.text, line.text.replace(/\s+/g, ' ').trim());
  });
  return paragraphs.filter((p) => p.text);
}

/** Appends a line, re-joining words hyphenated across the break ("exam-" + "ple"). */
export function joinLine(paragraph: string, line: string): string {
  if (!paragraph) return line;
  if (/[A-Za-z]-$/.test(paragraph) && /^[a-z]/.test(line)) return paragraph.slice(0, -1) + line;
  return `${paragraph} ${line}`;
}
