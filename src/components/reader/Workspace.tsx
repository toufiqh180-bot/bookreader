/**
 * The document area. Hands a DOM element to the AppController, which mounts
 * each tab's reader engine into it (the engine manages its own canvases and
 * layers), and layers React UI on top: the page bar, selection bar and
 * annotation editor. Shows the library when no book is open.
 */
import { useCallback, useState } from 'react';
import { cn } from '@/lib/cn';
import { useApp, useAppState } from '../../hooks/use-app.ts';
import { PageBar } from './PageBar.tsx';
import { SelectionBar } from '../annotations/SelectionBar.tsx';
import { AnnotationEditor } from '../annotations/AnnotationEditor.tsx';
import { LibraryView } from '../library/LibraryView.tsx';

export function Workspace() {
  const app = useApp();
  const state = useAppState();
  const [dragging, setDragging] = useState(false);
  const attach = useCallback((node: HTMLDivElement | null) => app.attachWorkspace(node), [app]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const pdfs = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    void app.openSources(pdfs.map((file) => app.platform.sourceForDroppedFile(file)));
  };

  return (
    <section
      className="relative min-w-0 flex-1 bg-canvas"
      data-tool={state.tool}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={onDrop}
    >
      <div ref={attach} className="reader-host absolute inset-0" />
      {!state.book && <LibraryView />}
      <PageBar />
      <SelectionBar />
      <AnnotationEditor />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-3 z-30 hidden place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-xl font-semibold text-primary',
          dragging && 'grid',
        )}
      >
        Drop a PDF to open it
      </div>
    </section>
  );
}
