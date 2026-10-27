'use strict';
// Burns annotations into the page content streams with pdf-lib so they render
// identically in every PDF app. Notes and comments are additionally written as
// standard /Text annotations so other readers show them as pop-up comments.
// Optionally embeds OCR words as invisible text, making scanned books searchable.
const { PDFDocument, rgb, BlendMode, StandardFonts, PDFName, PDFString } = require('pdf-lib');

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffeb3b;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function norm(r) {
  return { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2), w: Math.abs(r.x2 - r.x1), h: Math.abs(r.y2 - r.y1) };
}

// SVG path for a smooth stroke; pdf-lib's drawSvgPath flips y, so negate it.
function strokeToSvg(points) {
  if (!points.length) return '';
  const p = points.map((pt) => ({ x: pt.x, y: -pt.y }));
  if (p.length === 1) return `M ${p[0].x} ${p[0].y} L ${p[0].x + 0.1} ${p[0].y}`;
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2;
    const my = (p[i].y + p[i + 1].y) / 2;
    d += ` Q ${p[i].x} ${p[i].y} ${mx} ${my}`;
  }
  const last = p[p.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function squigglySvg(r) {
  const amp = Math.max(0.8, r.h * 0.06);
  const step = amp * 2;
  const y = -(r.y + amp);
  let d = `M ${r.x} ${y}`;
  for (let x = r.x, up = true; x < r.x + r.w; x += step, up = !up) {
    d += ` L ${Math.min(x + step, r.x + r.w)} ${up ? y - amp : y + amp}`;
  }
  return d;
}

function addTextAnnotation(doc, page, x, y, contents, color) {
  const c = hexToRgb(color);
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [x, y - 18, x + 18, y],
    Contents: PDFString.of(contents),
    Name: 'Comment',
    C: [c.red, c.green, c.blue],
    Open: false,
    F: 4,
  });
  const ref = doc.context.register(annot);
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing && existing.push) existing.push(ref);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

/**
 * @param {Buffer} bytes  original PDF
 * @param {{ annotations?: object[], ocr?: Record<string, {lines: object[]}> }} content
 * @returns {Promise<Uint8Array>}
 */
async function buildAnnotatedPdf(bytes, { annotations = [], ocr = {} } = {}) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const color = hexToRgb(a.color);
    for (const raw of a.rects || []) {
      const r = norm(raw);
      if (a.type === 'highlight') {
        page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color, opacity: 0.45, blendMode: BlendMode.Multiply });
      } else if (a.type === 'underline') {
        const t = Math.max(0.6, r.h * 0.07);
        page.drawLine({ start: { x: r.x, y: r.y + t }, end: { x: r.x + r.w, y: r.y + t }, thickness: t, color });
      } else if (a.type === 'strikeout') {
        const t = Math.max(0.6, r.h * 0.07);
        page.drawLine({ start: { x: r.x, y: r.y + r.h / 2 }, end: { x: r.x + r.w, y: r.y + r.h / 2 }, thickness: t, color });
      } else if (a.type === 'squiggly') {
        page.drawSvgPath(squigglySvg(r), { x: 0, y: 0, borderColor: color, borderWidth: Math.max(0.6, r.h * 0.06) });
      }
    }
    if (a.type === 'freehand') {
      for (const path of a.paths || []) {
        page.drawSvgPath(strokeToSvg(path), {
          x: 0,
          y: 0,
          borderColor: color,
          borderWidth: a.strokeWidth || 2,
          borderOpacity: a.tool === 'marker' ? 0.4 : 1,
          borderLineCap: 1,
        });
      }
    }
    const anchor = a.rects && a.rects[0] ? norm(a.rects[0]) : null;
    if (a.type === 'note' && anchor) {
      page.drawRectangle({ x: anchor.x, y: anchor.y + anchor.h - 14, width: 14, height: 14, color, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.5 });
      addTextAnnotation(doc, page, anchor.x, anchor.y + anchor.h, a.comment || a.textQuoted || 'Note', a.color);
    } else if (a.comment && anchor) {
      addTextAnnotation(doc, page, anchor.x + anchor.w, anchor.y + anchor.h, a.comment, a.color);
    }
  }

  // Invisible OCR text layer (text render opacity 0 stays selectable/searchable).
  for (const [pageNum, entry] of Object.entries(ocr)) {
    const page = pages[Number(pageNum) - 1];
    if (!page || !entry || !entry.lines) continue;
    for (const line of entry.lines) {
      for (const w of line.words) {
        let text = w.t;
        try {
          font.encodeText(text);
        } catch {
          text = text.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
        }
        if (!text) continue;
        const width = font.widthOfTextAtSize(text, 1);
        const h = Math.abs(w.y2 - w.y1);
        const size = Math.max(1, Math.min(width > 0 ? Math.abs(w.x2 - w.x1) / width : h, h * 1.4));
        page.drawText(text, { x: Math.min(w.x1, w.x2), y: Math.min(w.y1, w.y2) + h * 0.2, size, font, opacity: 0 });
      }
    }
  }

  return doc.save();
}

module.exports = { buildAnnotatedPdf };
