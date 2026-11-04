/**
 * Implementation for the Tauri shell (src-tauri/) on desktop, iOS and Android.
 * The UI runs in the system web view, so storage, the library and the
 * clipboard are shared with WebPlatform. What differs is native file dialogs
 * (the document picker on phones) and reading and writing PDFs on disk.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { WebPlatform } from './web-platform.ts';
import type { BookFile, BookSource, SaveFileOptions } from './platform.ts';

/** iOS and Android pick files as URLs (file://, content://), so names arrive percent-encoded. */
function basename(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Not percent-encoded (a plain desktop path containing a stray '%').
  }
  return decoded.split(/[\\/]/).pop() ?? decoded;
}

export class TauriPlatform extends WebPlatform {
  override readonly kind = 'desktop' as const;

  override async pickPdfFiles(): Promise<BookSource[]> {
    const picked = await open({ multiple: true, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    return (picked ?? []).map((path) => ({ kind: 'path', path }));
  }

  override async readBook(source: BookSource): Promise<BookFile> {
    if (source.kind !== 'path') return super.readBook(source);
    return { name: basename(source.path), path: source.path, bytes: await readFile(source.path) };
  }

  override async saveFile({ suggestedName, data, extension }: SaveFileOptions): Promise<string | null> {
    const path = await save({ defaultPath: suggestedName, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (!path) return null;
    if (typeof data === 'string') await writeTextFile(path, data);
    else await writeFile(path, data);
    return basename(path);
  }

  override setTitle(title: string): void {
    void getCurrentWindow().setTitle(title);
  }
}
