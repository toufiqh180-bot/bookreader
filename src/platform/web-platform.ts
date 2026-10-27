/**
 * Browser / installed-PWA implementation. Works on desktop browsers, iPhone,
 * iPad and Android.
 *
 * Browsers can't reopen files by path, so a copy of each opened PDF is kept
 * in IndexedDB together with its record — the library lives entirely in this
 * browser, on this device. Nothing is uploaded anywhere.
 */
import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import type { BookFile, BookSource, ExtraKind, LibraryEntry, OpenRequest, Platform, SaveFileOptions } from './platform.ts';
import type { BookRecord } from '../models/types.ts';

const key = {
  record: (id: string) => `record:${id}`,
  file: (id: string) => `file:${id}`,
  cover: (id: string) => `cover:${id}`,
  extra: (id: string, kind: ExtraKind) => `extra:${kind}:${id}`,
  prefs: 'preferences',
};

/** File System Access API (Chromium); absent in Safari/Firefox. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (
    options: unknown,
  ) => Promise<{ name: string; createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }> }>;
}

/** PWA launch queue: files opened via the OS "Open with" menu (Chromium). */
interface LaunchQueueWindow {
  launchQueue?: { setConsumer(consumer: (params: { files: Array<{ getFile(): Promise<File> }> }) => void): void };
}

export class WebPlatform implements Platform {
  readonly kind: 'web' | 'desktop' = 'web';
  readonly hasAppMenu = false;
  readonly isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  readonly #store: UseStore = createStore('bookreader', 'library');

  pickPdfFiles(): Promise<BookSource[]> {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/pdf,.pdf', multiple: true });
      input.addEventListener('change', () => resolve([...(input.files ?? [])].map((file) => ({ kind: 'file', file }))));
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    });
  }

  sourceForDroppedFile(file: File): BookSource {
    return { kind: 'file', file };
  }

  async readBook(source: BookSource): Promise<BookFile> {
    if (source.kind === 'file') return { name: source.file.name, bytes: new Uint8Array(await source.file.arrayBuffer()) };
    if (source.kind === 'stored') {
      const [bytes, record] = await Promise.all([get<Uint8Array>(key.file(source.bookId), this.#store), this.loadRecord(source.bookId)]);
      if (!bytes) throw new Error('This book is no longer stored in the browser.');
      return { name: record?.fileName ?? 'Book.pdf', bytes };
    }
    throw new Error('Browsers cannot open files by path.');
  }

  async rememberBook(bookId: string, file: BookFile): Promise<void> {
    if (!(await get(key.file(bookId), this.#store))) await set(key.file(bookId), file.bytes, this.#store);
  }

  sourceForLibraryEntry(entry: LibraryEntry): BookSource | null {
    return entry.available ? { kind: 'stored', bookId: entry.bookId } : null;
  }

  async loadRecord(id: string): Promise<BookRecord | null> {
    return (await get<BookRecord>(key.record(id), this.#store)) ?? null;
  }

  saveRecord(id: string, record: BookRecord): Promise<void> {
    // Structured clone keeps IndexedDB from holding references to live objects.
    return set(key.record(id), structuredClone(record), this.#store);
  }

  async loadExtra<T>(id: string, kind: ExtraKind): Promise<T | null> {
    return (await get<T>(key.extra(id, kind), this.#store)) ?? null;
  }

  saveExtra(id: string, kind: ExtraKind, data: unknown): Promise<void> {
    return set(key.extra(id, kind), structuredClone(data), this.#store);
  }

  saveCover(id: string, dataUrl: string): Promise<void> {
    return set(key.cover(id), dataUrl, this.#store);
  }

  async listLibrary(): Promise<LibraryEntry[]> {
    const ids = (await keys<string>(this.#store)).filter((k) => k.startsWith('record:')).map((k) => k.slice('record:'.length));
    const entries = await Promise.all(
      ids.map(async (bookId): Promise<LibraryEntry | null> => {
        const [record, cover, file] = await Promise.all([
          this.loadRecord(bookId),
          get<string>(key.cover(bookId), this.#store),
          get(key.file(bookId), this.#store),
        ]);
        if (!record) return null;
        return {
          bookId,
          fileName: record.fileName,
          available: Boolean(file),
          lastSaved: record.lastSaved,
          lastPage: record.sessionState?.lastPage ?? 1,
          pageCount: record.pageCount,
          annotationCount: record.annotations.length,
          cover: cover ?? null,
        };
      }),
    );
    return entries.filter((e): e is LibraryEntry => e !== null).sort((a, b) => b.lastSaved.localeCompare(a.lastSaved));
  }

  async removeFromLibrary(id: string): Promise<void> {
    await Promise.all([key.record(id), key.file(id), key.cover(id), key.extra(id, 'ocr'), key.extra(id, 'crop')].map((k) => del(k, this.#store)));
  }

  async loadPreferences(): Promise<Record<string, unknown>> {
    return (await get<Record<string, unknown>>(key.prefs, this.#store)) ?? {};
  }

  savePreferences(prefs: Record<string, unknown>): Promise<void> {
    return set(key.prefs, structuredClone(prefs), this.#store);
  }

  async saveFile({ suggestedName, data, mimeType, extension }: SaveFileOptions): Promise<string | null> {
    const blob = new Blob([data as BlobPart], { type: mimeType });
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName, types: [{ description: extension.toUpperCase(), accept: { [mimeType]: [`.${extension}`] } }] });
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
        return handle.name;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return null;
        // Fall through to a plain download (e.g. blocked in an iframe).
      }
    }
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: suggestedName }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return suggestedName;
  }

  copyText(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }

  setTitle(title: string): void {
    document.title = title;
  }

  linkBase(): string {
    return location.href.split('#')[0];
  }

  onCommand(): void {
    // No native menu on the web; the UI and keyboard dispatch commands directly.
  }

  onOpenRequest(handler: (request: OpenRequest) => void): void {
    (window as LaunchQueueWindow).launchQueue?.setConsumer(async ({ files }) => {
      for (const handle of files) handler({ type: 'source', source: { kind: 'file', file: await handle.getFile() } });
    });
    const handleHash = () => {
      if (location.hash.startsWith('#open?')) handler({ type: 'link', url: location.href });
    };
    window.addEventListener('hashchange', handleHash);
    this.#pendingHash = handleHash;
  }

  #pendingHash: (() => void) | null = null;

  signalReady(): void {
    // A link the page was opened with is handled once the UI is ready.
    this.#pendingHash?.();
  }
}
