/**
 * Splits a page's text into sentences for read-aloud. Each sentence keeps its
 * character range in `PageText.str`, so the sentence being spoken can be
 * highlighted on the page with `rectsForRange`. The spoken text is cleaned:
 * line breaks become spaces and words hyphenated across a line are joined.
 */
import { rectsForRange, type PageText } from './page-text.ts';

export interface Sentence {
  /** Range in `PageText.str`, end exclusive. */
  start: number;
  end: number;
  /** What is spoken. */
  text: string;
}

/** A line this short, unpunctuated and starting its own sentence, is read as a heading. */
const MAX_HEADING_CHARS = 40;
/** Long runs without punctuation (tables, captions) are broken up so voices don't stall. */
const MAX_SENTENCE_CHARS = 280;

/** Words that end in a full stop without ending the sentence. */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'fig',
  'figs',
  'no',
  'vol',
  'ch',
  'pp',
  'p',
  'ed',
  'cf',
  'approx',
  'inc',
  'ltd',
  'co',
]);

const TERMINATORS = '.!?…';
const CLOSERS = '"\')]}”’»';

/** The word ending just before `index` (exclusive), for abbreviation checks. */
function wordBefore(str: string, index: number): string {
  let i = index;
  while (i > 0 && /[\p{L}.]/u.test(str[i - 1])) i--;
  return str.slice(i, index);
}

function endsSentence(str: string, i: number): boolean {
  const ch = str[i];
  if (!TERMINATORS.includes(ch)) return false;
  // Decimals and versions ("3.5", "v1.2").
  if (ch === '.' && /\d/.test(str[i - 1] ?? '') && /\d/.test(str[i + 1] ?? '')) return false;
  if (ch === '.') {
    const word = wordBefore(str, i);
    if (ABBREVIATIONS.has(word.toLowerCase())) return false;
    // Initials ("J. R. R. Tolkien").
    if (word.length === 1 && /\p{Lu}/u.test(word)) return false;
  }
  let j = i + 1;
  while (j < str.length && (TERMINATORS.includes(str[j]) || CLOSERS.includes(str[j]))) j++;
  if (j >= str.length) return true;
  return /\s/.test(str[j]);
}

/** Index just past a terminator and any closing quotes/brackets after it. */
function afterTerminator(str: string, i: number): number {
  let j = i + 1;
  while (j < str.length && (TERMINATORS.includes(str[j]) || CLOSERS.includes(str[j]))) j++;
  return j;
}

/** Spoken form of `str[start, end)`: hyphenated line breaks joined, whitespace collapsed. */
export function cleanForSpeech(str: string): string {
  return str
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushSentence(out: Sentence[], str: string, start: number, end: number): void {
  // Trim the range to its visible characters so highlights hug the text.
  while (start < end && /\s/.test(str[start])) start++;
  while (end > start && /\s/.test(str[end - 1])) end--;
  if (start >= end) return;
  const text = cleanForSpeech(str.slice(start, end));
  // Bare page numbers, running heads of digits, lone symbols: nothing worth saying.
  if (!/\p{L}/u.test(text)) return;
  if (text.length <= MAX_SENTENCE_CHARS) {
    out.push({ start, end, text });
    return;
  }
  // Break overlong text at the last comma/semicolon (or space) before the limit.
  let cut = start + MAX_SENTENCE_CHARS;
  const window = str.slice(start, cut);
  const punct = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
  if (punct > MAX_SENTENCE_CHARS / 3) cut = start + punct + 1;
  else {
    const space = window.lastIndexOf(' ');
    if (space > MAX_SENTENCE_CHARS / 3) cut = start + space;
  }
  pushSentence(out, str, start, cut);
  pushSentence(out, str, cut, end);
}

/**
 * True when the line ending at `end` is a heading ("Chapter 1"): short,
 * capitalised, no closing punctuation, the first line of its sentence, and
 * followed by a line that starts with a capital or digit.
 */
function isHeadingLine(str: string, sentenceStart: number, lineStart: number, end: number): boolean {
  if (str.slice(sentenceStart, lineStart).trim()) return false;
  const line = str.slice(lineStart, end).trim();
  if (!line || line.length > MAX_HEADING_CHARS || /[.!?…,;:\-–—]$/.test(line)) return false;
  // Titles are capitalised ("Chapter 1", "A Study in Scarlet"); wrapped prose mostly isn't.
  const words = line.split(/\s+/);
  if (words.filter((w) => /^[\p{Lu}\d]/u.test(w)).length * 2 < words.length) return false;
  const next = str.slice(end + 1).trimStart()[0];
  return next !== undefined && /[\p{Lu}\d"“'‘]/u.test(next);
}

/** Sentences of a page in reading order. Blank lines, headings and OCR paragraph ends also break sentences. */
export function splitSentences(page: PageText): Sentence[] {
  const { str } = page;
  const paragraphEnds = new Set(page.runs.filter((r) => r.paragraphEnd).map((r) => r.start + r.str.length));
  const out: Sentence[] = [];
  let start = 0;
  let lineStart = 0;
  for (let i = 0; i < str.length; i++) {
    if (endsSentence(str, i)) {
      const end = afterTerminator(str, i);
      pushSentence(out, str, start, end);
      start = end;
      i = end - 1;
      continue;
    }
    const newline = str[i] === '\n';
    const blankLine = newline && str[i + 1] === '\n';
    if (blankLine || paragraphEnds.has(i) || (newline && isHeadingLine(str, start, lineStart, i))) {
      pushSentence(out, str, start, i);
      start = i;
    }
    if (newline) lineStart = i + 1;
  }
  pushSentence(out, str, start, str.length);
  return out;
}

/** Index of the sentence containing character `index` (or the next one after it). */
export function sentenceIndexAt(sentences: Sentence[], index: number): number {
  const found = sentences.findIndex((s) => index < s.end);
  return found === -1 ? Math.max(0, sentences.length - 1) : found;
}

/**
 * Character index nearest a PDF-space point: the run under the point (or the
 * closest run on that line), then the proportional position within it.
 */
export function charIndexAt(page: PageText, x: number, y: number): number {
  let best = { index: 0, score: Infinity };
  for (const run of page.runs) {
    if (!run.str.length) continue;
    const [rect] = rectsForRange(page, run.start, run.start + run.str.length);
    if (!rect) continue;
    const top = Math.max(rect.y1, rect.y2);
    const bottom = Math.min(rect.y1, rect.y2);
    const left = Math.min(rect.x1, rect.x2);
    const right = Math.max(rect.x1, rect.x2);
    const dy = y > top ? y - top : y < bottom ? bottom - y : 0;
    const dx = x > right ? x - right : x < left ? left - x : 0;
    // Lines matter more than columns: prefer the right line, then the nearest run on it.
    const score = dy * 4 + dx;
    if (score < best.score) {
      const fraction = right > left ? Math.min(1, Math.max(0, (x - left) / (right - left))) : 0;
      best = { index: run.start + Math.floor(fraction * run.str.length), score };
    }
  }
  return best.index;
}
