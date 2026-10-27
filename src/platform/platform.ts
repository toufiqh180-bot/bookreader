/**
 * Everything the app needs from its host, behind one interface. Two
 * implementations exist:
 *
 *   TauriPlatform     desktop app: native dialogs, PDFs read from disk
 *   WebPlatform       browsers / installed PWA: IndexedDB, file picker, downloads
 *
 * The rest of the app never checks which one it is running on; it only talks
 * to `Platform`. Pick one with `getPlatform()` (platform/index.ts).
 */
import type { BookRecord } from '../models/types.ts';

/** Where a book comes from, before it has been read. */
export type BookSource =
  | { kind: 'path'; path: string } // desktop: a file on disk
  | { kind: 'file'; file: File } // web: picked or dropped by the user
  | { kind: 'stored'; bookId: string }; // web: a copy kept in the library

/** A book's bytes plus how to find it again. */
export interface BookFile {
  name: string;
  bytes: Uint8Array;
  /** Desktop only. */
  path?: string;
}

export interface LibraryEntry {
  bookId: string;
  fileName: string;
  filePath?: string;
  /** False when the desktop file has moved or been deleted. */
  available: boolean;
  lastSaved: string;
  lastPage: number;
  pageCount: number;
  annotationCount: number;
  /** data: URL of the cover thumbnail. */
  cover: string | null;
}

/** Extra per-book caches stored next to the record. */
export type ExtraKind = 'ocr' | 'crop';

export interface SaveFileOptions {
  suggestedName: string;
  data: Uint8Array | string;
  mimeType: string;
  extension: string;
}

/** A request from outside the page: a file opened from the OS, or a deep link. */
export type OpenRequest = { type: 'source'; source: BookSource } | { type: 'link'; url: string };

export interface Platform {
  readonly kind: 'desktop' | 'web';
  /** Native menu bar present (desktop), so the UI can skip duplicating it. */
  readonly hasAppMenu: boolean;
  readonly isMac: boolean;

  // ---- Opening books ----
  pickPdfFiles(): Promise<BookSource[]>;
  /** Source for a file dropped on the window. */
  sourceForDroppedFile(file: File): BookSource;
  readBook(source: BookSource): Promise<BookFile>;
  /** Called once a book is identified, so the library can reopen it later. */
  rememberBook(bookId: string, file: BookFile): Promise<void>;
  /** How to reopen a library entry, or null if its file is gone. */
  sourceForLibraryEntry(entry: LibraryEntry): BookSource | null;

  // ---- Library storage ----
  loadRecord(bookId: string): Promise<BookRecord | null>;
  saveRecord(bookId: string, record: BookRecord): Promise<void>;
  loadExtra<T>(bookId: string, kind: ExtraKind): Promise<T | null>;
  saveExtra(bookId: string, kind: ExtraKind, data: unknown): Promise<void>;
  saveCover(bookId: string, dataUrl: string): Promise<void>;
  listLibrary(): Promise<LibraryEntry[]>;
  removeFromLibrary(bookId: string): Promise<void>;
  loadPreferences(): Promise<Record<string, unknown>>;
  savePreferences(prefs: Record<string, unknown>): Promise<void>;

  // ---- Output ----
  /** Saves (desktop) or downloads (web) a file. Resolves to its name, or null if cancelled. */
  saveFile(options: SaveFileOptions): Promise<string | null>;
  copyText(text: string): Promise<void>;
  /** Shows a saved file in Finder/Explorer, where supported. */
  revealFile?(path: string): void;
  setTitle(title: string): void;
  /** Link that reopens a spot in a book on this platform. */
  linkBase(): 'bookreader' | string;

  // ---- Events from the host ----
  onCommand(handler: (command: string, arg?: unknown) => void): void;
  onOpenRequest(handler: (request: OpenRequest) => void): void;
  /** Tells the host the UI is ready to receive open requests. */
  signalReady(): void;
}
