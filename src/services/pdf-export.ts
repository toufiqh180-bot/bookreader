/**
 * Writes a copy of a PDF with:
 *   - annotations burned into the page content, so they render the same in
 *     every PDF app (notes and comments are also added as standard /Text
 *     annotations, which other readers show as pop-up comments), and/or
 *   - OCR words as invisible text, making a scanned book searchable.
 * The original file is never modified.
 */
import { BlendMode, PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';
import { squigglyPath, toBox } from '../lib/geometry.ts';
import type { Annotation, OcrPage, PdfPoint } from '../models/types.ts';

const NOTE_ICON_SIZE = 14;
const HIGHLIGHT_OPACITY = 0.45;
const MARKER_OPACITY = 0.4;

function hexToRgb(hex: string | undefined): RGB {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const n = match ? parseInt(match[1], 16) : 0xffeb3b;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** pdf-lib's drawSvgPath flips y, so PDF-space points are negated on the way in. */
function strokeToSvg(points: PdfPoint[]): string {
  if (!points.length) return '';
  const p = points.map((pt) => ({ x: pt.x, y: -pt.y }));
  if (p.length === 1) return `M ${p[0].x} ${p[0].y} L ${p[0].x + 0.1} ${p[0].y}`;
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) d += ` Q ${p[i].x} ${p[i].y} ${(p[i].x + p[i + 1].x) / 2} ${(p[i].y + p[i + 1].y) / 2}`;
  const last = p[p.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

const flipY = (d: string) => d.replace(/([ML]\S*) (\S+)/g, (_, x: string, y: string) => `${x} ${-Number(y)}`);

function addTextAnnotation(doc: PDFDocument, page: PDFPage, x: number, y: number, contents: string, color: string): void {
  const c = hexToRgb(color);
  const annotation = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [x, y - 18, x + 18, y],
    Contents: PDFString.of(contents),
    Name: 'Comment',
    C: [c.red, c.green, c.blue],
    Open: false,
    F: 4,
  });
  const ref = doc.context.register(annotation);
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing && 'push' in existing) (existing as unknown as { push(r: unknown): void }).push(ref);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

function drawAnnotation(doc: PDFDocument, page: PDFPage, a: Annotation): void {
  const color = hexToRgb(a.color);
  for (const rect of a.rects ?? []) {
    const b = toBox(rect);
    const thickness = Math.max(0.6, b.h * 0.07);
    switch (a.type) {
      case 'highlight':
        page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color, opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply });
        break;
      case 'underline':
        page.drawLine({ start: { x: b.x, y: b.y + thickness }, end: { x: b.x + b.w, y: b.y + thickness }, thickness, color });
        break;
      case 'strikeout':
        page.drawLine({ start: { x: b.x, y: b.y + b.h / 2 }, end: { x: b.x + b.w, y: b.y + b.h / 2 }, thickness, color });
        break;
      case 'squiggly':
        page.drawSvgPath(flipY(squigglyPath(b)), { x: 0, y: 0, borderColor: color, borderWidth: thickness * 0.9 });
        break;
    }
  }
  if (a.type === 'freehand') {
    for (const path of a.paths ?? []) {
      page.drawSvgPath(strokeToSvg(path), {
        x: 0,
        y: 0,
        borderColor: color,
        borderWidth: a.strokeWidth ?? 2,
        borderOpacity: a.tool === 'marker' ? MARKER_OPACITY : 1,
        borderLineCap: 1, // round
      });
    }
  }
  const anchor = a.rects?.[0] ? toBox(a.rects[0]) : null;
  if (!anchor) return;
  if (a.type === 'note') {
    page.drawRectangle({
      x: anchor.x,
      y: anchor.y + anchor.h - NOTE_ICON_SIZE,
      width: NOTE_ICON_SIZE,
      height: NOTE_ICON_SIZE,
      color,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.5,
    });
    addTextAnnotation(doc, page, anchor.x, anchor.y + anchor.h, a.comment || a.textQuoted || 'Note', a.color);
  } else if (a.comment) {
    addTextAnnotation(doc, page, anchor.x + anchor.w, anchor.y + anchor.h, a.comment, a.color);
  }
}

/** Invisible (opacity 0) text stays selectable and searchable in other apps. */
function drawOcrText(page: PDFPage, font: PDFFont, ocr: OcrPage): void {
  for (const line of ocr.lines) {
    for (const word of line.words) {
      let text = word.t;
      try {
        font.encodeText(text);
      } catch {
        text = text.normalize('NFKD').replace(/[^\x20-\x7e]/g, ''); // Helvetica covers WinAnsi only
      }
      if (!text) continue;
      const box = toBox(word);
      const naturalWidth = font.widthOfTextAtSize(text, 1);
      const size = Math.max(1, Math.min(naturalWidth > 0 ? box.w / naturalWidth : box.h, box.h * 1.4));
      page.drawText(text, { x: box.x, y: box.y + box.h * 0.2, size, font, opacity: 0 });
    }
  }
}

export async function buildAnnotatedPdf(
  bytes: Uint8Array,
  { annotations = [], ocr = {} }: { annotations?: Annotation[]; ocr?: Record<number, OcrPage> },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (page) drawAnnotation(doc, page, a);
  }
  if (Object.keys(ocr).length) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const [pageNumber, entry] of Object.entries(ocr)) {
      const page = pages[Number(pageNumber) - 1];
      if (page && entry?.lines) drawOcrText(page, font, entry);
    }
  }
  return doc.save();
}
