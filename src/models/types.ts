/**
 * The persisted data model — the "unified book record" stored per book.
 * See docs/ARCHITECTURE.md → "Storage schema".
 *
 * All geometry is in PDF user space: points, origin at the bottom-left of the
 * page. Screen coordinates never reach storage, so zoom, crop and page
 * splitting can't invalidate saved data.
 */

/** A rectangle given by two corners, in PDF user space. */
export interface PdfRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export type AnnotationType = 'highlight' | 'underline' | 'squiggly' | 'strikeout' | 'note' | 'freehand';
export type MarkupType = Extract<AnnotationType, 'highlight' | 'underline' | 'squiggly' | 'strikeout'>;

export interface Annotation {
  id: string;
  type: AnnotationType;
  /** 1-based PDF page number. */
  page: number;
  /** CSS hex colour. */
  color: string;
  createdAt: string;
  updatedAt?: string;
  /** Text under a markup, or the passage a note is anchored to. */
  textQuoted?: string;
  /** One rect per text line for markups; the pin's box for notes. */
  rects?: PdfRect[];
  comment?: string;
  /** Freehand only. */
  tool?: 'pen' | 'marker';
  strokeWidth?: number;
  paths?: PdfPoint[][];
}

export interface Bookmark {
  id: string;
  page: number;
  title: string;
  createdAt: string;
}

export interface HistoryEntry {
  page: number;
  x: number;
  y: number;
  timestamp: string;
}

/** A place in the book. `x`/`y` are optional PDF coordinates within the page. */
export interface Position {
  page: number;
  x?: number | null;
  y?: number | null;
}

export type ViewMode = 'continuous' | 'single' | 'two-page';
export type ZoomMode = 'auto' | 'fit-page' | 'fit-width' | 'custom';

export interface SessionState {
  lastPage: number;
  zoomLevel: number | null;
  zoomMode: ZoomMode;
  viewMode: ViewMode;
  theme: string | null;
  isMarginCropped: boolean;
  /** Show each two-page scan as two pages. `null` = not decided yet. */
  splitSpreads: boolean | null;
  navigationStack: HistoryEntry[];
  stackPointer: number;
}

export interface BookRecord {
  bookId: string;
  fileName: string;
  /** Desktop only: where the file was last opened from. */
  filePath?: string;
  pageCount: number;
  lastSaved: string;
  sessionState: SessionState;
  annotations: Annotation[];
  bookmarks: Bookmark[];
}

/** OCR output for one page: recognised words with their boxes. */
export interface OcrWord extends PdfRect {
  t: string;
}

export interface OcrLine {
  words: OcrWord[];
  /** The line ends a paragraph. */
  pe?: boolean;
}

export interface OcrPage {
  lines: OcrLine[];
}

/** Margin-crop boxes as fractions of the page (origin top-left). */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropBoxes {
  odd: CropBox;
  even: CropBox;
}

/** A page's size at 100% zoom, in CSS px (rotation applied). */
export interface PageSize {
  w: number;
  h: number;
}
