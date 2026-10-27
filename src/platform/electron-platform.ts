/**
 * Desktop implementation: a thin adapter over `window.bookreaderHost`, the
 * API the Electron preload script exposes (electron/preload.cjs). Books stay
 * where they are on disk; the library keeps JSON records in the app's data
 * folder.
 */
import type { BookFile, BookSource, ExtraKind, LibraryEntry, OpenRequest, Platform, SaveFileOptions } from './platform.ts';
import type { BookRecord } from '../models/types.ts';

/** Shape of the preload bridge. Keep in sync with electron/preload.cjs. */
export interface ElectronHost {
  platform: string;
  showOpenDialog(): Promise<string[]>;
  readFile(path: string): Promise<{ name: string; bytes: Uint8Array; path: string }>;
  pathForFile(file: File): string;
  loadBook(id: string): Promise<BookRecord | null>;
  saveBook(id: string, record: BookRecord): Promise<void>;
  loadExtra(id: string, kind: string): Promise<unknown>;
  saveExtra(id: string, kind: string, data: unknown): Promise<void>;
  saveCover(id: string, dataUrl: string): Promise<void>;
  listLibrary(): Promise<LibraryEntry[]>;
  removeFromLibrary(id: string): Promise<void>;
  loadPrefs(): Promise<Record<string, unknown>>;
  savePrefs(prefs: Record<string, unknown>): Promise<void>;
  saveFile(options: { suggestedName: string; data: Uint8Array | string; extension: string }): Promise<string | null>;
  copyText(text: string): Promise<void>;
  revealInFolder(path: string): Promise<void>;
  setTitle(title: string): void;
  signalReady(): void;
  onCommand(handler: (command: string, arg?: unknown) => void): void;
  onOpenRequest(handler: (request: { type: 'file'; path: string } | { type: 'link'; url: string }) => void): void;
}

declare global {
  interface Window {
    bookreaderHost?: ElectronHost;
  }
}

export class ElectronPlatform implements Platform {
  readonly kind = 'electron' as const;
  readonly hasAppMenu = true;
  readonly isMac: boolean;
  readonly #host: ElectronHost;

  constructor(host: ElectronHost) {
    this.#host = host;
    this.isMac = host.platform === 'darwin';
  }

  async pickPdfFiles(): Promise<BookSource[]> {
    return (await this.#host.showOpenDialog()).map((path) => ({ kind: 'path', path }));
  }

  sourceForDroppedFile(file: File): BookSource {
    return { kind: 'path', path: this.#host.pathForFile(file) };
  }

  async readBook(source: BookSource): Promise<BookFile> {
    if (source.kind !== 'path') throw new Error(`Desktop can't open a ${source.kind} source`);
    return this.#host.readFile(source.path);
  }

  async rememberBook(): Promise<void> {
    // The record stores filePath; nothing else to keep on desktop.
  }

  sourceForLibraryEntry(entry: LibraryEntry): BookSource | null {
    return entry.available && entry.filePath ? { kind: 'path', path: entry.filePath } : null;
  }

  loadRecord = (id: string) => this.#host.loadBook(id);
  saveRecord = (id: string, record: BookRecord) => this.#host.saveBook(id, record);
  loadExtra = <T>(id: string, kind: ExtraKind) => this.#host.loadExtra(id, kind) as Promise<T | null>;
  saveExtra = (id: string, kind: ExtraKind, data: unknown) => this.#host.saveExtra(id, kind, data);
  saveCover = (id: string, dataUrl: string) => this.#host.saveCover(id, dataUrl);
  listLibrary = () => this.#host.listLibrary();
  removeFromLibrary = (id: string) => this.#host.removeFromLibrary(id);
  loadPreferences = () => this.#host.loadPrefs();
  savePreferences = (prefs: Record<string, unknown>) => this.#host.savePrefs(prefs);

  saveFile({ suggestedName, data, extension }: SaveFileOptions): Promise<string | null> {
    return this.#host.saveFile({ suggestedName, data, extension });
  }

  copyText = (text: string) => this.#host.copyText(text);

  revealFile(path: string): void {
    void this.#host.revealInFolder(path);
  }

  setTitle = (title: string) => this.#host.setTitle(title);

  linkBase(): string {
    return 'bookreader';
  }

  onCommand(handler: (command: string, arg?: unknown) => void): void {
    this.#host.onCommand(handler);
  }

  onOpenRequest(handler: (request: OpenRequest) => void): void {
    this.#host.onOpenRequest((request) => handler(request.type === 'file' ? { type: 'source', source: { kind: 'path', path: request.path } } : request));
  }

  signalReady(): void {
    this.#host.signalReady();
  }
}
