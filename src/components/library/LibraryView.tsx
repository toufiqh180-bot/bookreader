/**
 * Home screen: books you're reading, with covers and progress, plus an Open
 * button and a drop target. Stored on this device only.
 */
import { useEffect, useState } from 'react';
import { BookOpen, FileText, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { Wordmark } from '../common/Logo.tsx';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { fileBaseName } from '../../lib/util.ts';
import type { LibraryEntry } from '../../platform/platform.ts';

export function LibraryView() {
  const app = useApp();
  const { libraryVersion } = useAppState();
  const run = useCommand();
  const [books, setBooks] = useState<LibraryEntry[] | null>(null);
  const [removing, setRemoving] = useState<LibraryEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void app.platform.listLibrary().then((entries) => !cancelled && setBooks(entries));
    return () => {
      cancelled = true;
    };
  }, [app, libraryVersion]);

  const open = (entry: LibraryEntry) => {
    const source = app.platform.sourceForLibraryEntry(entry);
    if (source) void app.openSource(source);
  };

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-24 sm:px-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Wordmark className="mb-6 text-lg" />
            <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
            <p className="mt-1 text-muted-foreground">
              {app.platform.kind === 'web'
                ? 'Your books and notes are stored in this browser, on this device.'
                : 'Your books, notes and reading positions — stored on this computer.'}
            </p>
          </div>
          <Button onClick={() => run('file.open')} className="rounded-full px-5">
            <FolderOpen /> Open PDF…
          </Button>
        </header>

        {books && !books.length && (
          <div className="grid min-h-[50vh] place-items-center">
            <button
              type="button"
              onClick={() => run('file.open')}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-16 py-12 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <BookOpen className="size-10" aria-hidden />
              <span className="mt-2 text-lg font-medium text-foreground">Open a PDF to start reading</span>
              <span>or drop one anywhere on this window</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-6 gap-y-8">
          {books?.map((book) => {
            const progress = book.pageCount > 1 ? Math.round(((book.lastPage - 1) / (book.pageCount - 1)) * 100) : 0;
            return (
              <div key={book.bookId} className={cn('group relative flex flex-col gap-1.5', !book.available && 'opacity-50')}>
                <button type="button" disabled={!book.available} onClick={() => open(book)} title={book.filePath ?? book.fileName} className="text-left">
                  <div className="aspect-[3/4] overflow-hidden rounded-md bg-white shadow-md transition group-hover:-translate-y-1 group-hover:shadow-xl">
                    {book.cover ? (
                      <img src={book.cover} alt="" className="size-full object-contain" />
                    ) : (
                      <FileText className="m-auto mt-[40%] size-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-2 line-clamp-2 leading-snug font-semibold">{fileBaseName(book.fileName)}</div>
                  <div className="text-xs text-muted-foreground">{book.available ? `${progress}% · ${book.annotationCount} notes` : 'File not found'}</div>
                </button>
                <div className="h-[3px] overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Remove from library"
                  onClick={() => setRemoving(book)}
                  className="absolute top-2 right-2 size-7 opacity-0 shadow-md group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove “{removing && fileBaseName(removing.fileName)}”?</DialogTitle>
            <DialogDescription>
              Its highlights, notes and bookmarks will be deleted from this device.
              {app.platform.kind === 'desktop' ? ' The PDF file itself is not touched.' : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) void app.removeFromLibrary(removing.bookId);
                setRemoving(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
