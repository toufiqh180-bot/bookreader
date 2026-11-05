/**
 * The document area. Hands a DOM element to the AppController, which mounts
 * each tab's reader engine into it (the engine manages its own canvases and
 * layers), and layers React UI on top: the page bar, selection bar and
 * annotation editor. Shows the library when no book is open. A tap on the
 * page shows or hides the bars (focus mode; touch screens).
 */
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { PageBar } from './PageBar.tsx';
import { SelectionBar } from '../annotations/SelectionBar.tsx';
import { AnnotationEditor } from '../annotations/AnnotationEditor.tsx';
import { LibraryView } from '../library/LibraryView.tsx';

/** Movement and duration that still count as a tap, and the pause before acting on one. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 400;
const TAP_SETTLE_MS = 60;
/** iOS can report one tap twice; a second toggle this soon after the first is ignored. */
const TAP_REPEAT_MS = 400;

export function Workspace() {
  const app = useApp();
  const state = useAppState();
  const run = useCommand();
  const [dragging, setDragging] = useState(false);
  // A tap is a quick touch that barely moves (not a scroll, long press or selection). Detected from
  // pointer events: iOS doesn't send click events for taps on plain page content.
  const tap = useRef<{ x: number; y: number; time: number; type: string } | null>(null);
  const lastToggle = useRef(0);

  const onPointerUp = (e: React.PointerEvent) => {
    const start = tap.current;
    tap.current = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX || e.timeStamp - start.time > TAP_MAX_MS) return;
    const target = e.target as Element;
    if (!state.book || state.tool !== 'select' || !target.closest('.page, .reflow-article')) return;
    if (target.closest('a, button, input, .pdf-link, .annot, .annot-hit')) return;
    // Mouse clicks on the page are for selecting text; only taps, or any click in focus mode, toggle the bars.
    if (!state.focus && start.type === 'mouse') return;
    // Let a double-tap or long-press selection settle before deciding.
    setTimeout(() => {
      if (!window.getSelection()?.isCollapsed || performance.now() - lastToggle.current < TAP_REPEAT_MS) return;
      lastToggle.current = performance.now();
      run('view.tapPage');
    }, TAP_SETTLE_MS);
  };
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
      onPointerDown={(e) => (tap.current = e.isPrimary ? { x: e.clientX, y: e.clientY, time: e.timeStamp, type: e.pointerType } : null)}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (tap.current = null)}
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
