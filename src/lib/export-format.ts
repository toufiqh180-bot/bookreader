/**
 * Serialises a book's annotations and bookmarks to portable formats, so notes
 * are never trapped inside one app. Pure functions of the book record.
 */
import type { Annotation, AnnotationType, BookRecord } from '../models/types.ts';

export const ANNOTATION_LABELS: Record<AnnotationType, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  squiggly: 'Squiggly underline',
  strikeout: 'Strikethrough',
  note: 'Note',
  freehand: 'Drawing',
};

export type ExportFormat = 'md' | 'txt' | 'json';

type PageLabel = (page: number) => string;

/** Reading order: by page, then top to bottom (PDF y grows upward). */
export function inReadingOrder(annotations: Annotation[]): Annotation[] {
  const top = (a: Annotation) => (a.rects?.[0] ? Math.max(a.rects[0].y1, a.rects[0].y2) : (a.paths?.[0]?.[0]?.y ?? 0));
  return [...annotations].sort((a, b) => a.page - b.page || top(b) - top(a));
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ');

export function toMarkdown(record: BookRecord, pageLabel: PageLabel = String, exportedAt = new Date()): string {
  const lines = [
    `# Notes — ${record.fileName}`,
    '',
    `_Exported ${exportedAt.toLocaleString()} · ${record.annotations.length} annotations · ${record.bookmarks.length} bookmarks_`,
    '',
  ];
  if (record.bookmarks.length) {
    lines.push('## Bookmarks', '');
    for (const b of record.bookmarks) lines.push(`- **p. ${pageLabel(b.page)}** — ${b.title}`);
    lines.push('');
  }
  lines.push('## Annotations', '');
  let page: number | null = null;
  for (const a of inReadingOrder(record.annotations)) {
    if (a.page !== page) {
      page = a.page;
      lines.push(`### Page ${pageLabel(page)}`, '');
    }
    const label = `**${ANNOTATION_LABELS[a.type] ?? a.type}** (${a.color})`;
    if (a.textQuoted) lines.push(`- ${label}`, `  > ${oneLine(a.textQuoted)}`);
    else if (a.type === 'freehand') lines.push(`- ${label} — ${a.paths?.length ?? 0} stroke(s)`);
    else lines.push(`- ${label}`);
    if (a.comment) lines.push(`  - ${a.comment.replace(/\n/g, '\n    ')}`);
  }
  if (!record.annotations.length) lines.push('_No annotations._');
  return `${lines.join('\n')}\n`;
}

export function toPlainText(record: BookRecord, pageLabel: PageLabel = String, exportedAt = new Date()): string {
  const lines = [`NOTES — ${record.fileName}`, `Exported ${exportedAt.toLocaleString()}`, ''];
  if (record.bookmarks.length) {
    lines.push('BOOKMARKS');
    for (const b of record.bookmarks) lines.push(`  p. ${pageLabel(b.page)}  ${b.title}`);
    lines.push('');
  }
  lines.push('ANNOTATIONS');
  for (const a of inReadingOrder(record.annotations)) {
    const quote = a.textQuoted ? `: "${oneLine(a.textQuoted)}"` : '';
    lines.push(`  [p. ${pageLabel(a.page)}] ${ANNOTATION_LABELS[a.type] ?? a.type}${quote}`);
    if (a.comment) lines.push(`      ${a.comment.replace(/\n/g, '\n      ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The full record, as stored. */
export function toJson(record: BookRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export const EXPORTERS: Record<ExportFormat, { serialize: (r: BookRecord, label?: PageLabel) => string; suffix: string; mime: string }> = {
  md: { serialize: toMarkdown, suffix: 'notes', mime: 'text/markdown' },
  txt: { serialize: toPlainText, suffix: 'notes', mime: 'text/plain' },
  json: { serialize: toJson, suffix: 'annotations', mime: 'application/json' },
};
