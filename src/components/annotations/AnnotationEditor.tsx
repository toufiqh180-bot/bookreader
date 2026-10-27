/**
 * Popover for one annotation: its quoted text, colour, comment and delete.
 * Sticky notes open here when clicked — the collapsible comment of the spec
 * (closed = pin on the page, open = this editor).
 */
import { useEffect, useMemo, useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { IconButton } from '../common/IconButton.tsx';
import { Swatches } from '../common/Swatches.tsx';
import { useApp, useAppState, useEmitter } from '../../hooks/use-app.ts';
import { ANNOTATION_LABELS } from '../../lib/export-format.ts';

const QUOTE_PREVIEW_CHARS = 280;

/** Screen position to anchor the editor: the click point, or the annotation's on-page box. */
function anchorFor(target: NonNullable<ReturnType<typeof useAppState>['editing']>, page: number): { x: number; y: number } {
  if (target.at) return target.at;
  for (const view of target.pane.viewsForPage(page)) {
    const node = view.overlayGroup.querySelector(`[data-id="${target.annotationId}"]`);
    if (node?.isConnected) {
      const r = node.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.bottom };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

export function AnnotationEditor() {
  const app = useApp();
  const { editing } = useAppState();
  const store = editing?.pane.book.annotations ?? null;
  useEmitter(store, 'change');
  const annotation = editing && store ? store.get(editing.annotationId) : null;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const anchor = useMemo(() => (editing && annotation ? anchorFor(editing, annotation.page) : null), [editing, annotation]);

  useEffect(() => {
    if (editing && annotation && !annotation.comment) textarea.current?.focus();
    // Focus once when a (new) annotation opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.annotationId]);

  if (!editing || !annotation || !anchor || !store) return null;
  const quote = annotation.textQuoted;

  return (
    <Popover open onOpenChange={(open) => !open && app.closeEditor()}>
      <PopoverAnchor asChild>
        <div className="pointer-events-none fixed size-px" style={{ left: anchor.x, top: anchor.y }} />
      </PopoverAnchor>
      <PopoverContent sideOffset={10} className="flex w-80 flex-col gap-3 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <header className="flex items-center gap-2">
          <strong className="text-[13px]">{ANNOTATION_LABELS[annotation.type]}</strong>
          <span className="text-xs text-muted-foreground">p. {editing.pane.book.pageLabel(annotation.page)}</span>
          <span className="flex-1" />
          <IconButton
            label="Delete"
            shortcut="⌘Z undoes"
            className="size-7 hover:text-destructive"
            onClick={() => {
              store.remove(annotation.id);
              app.closeEditor();
            }}
          >
            <Trash2 />
          </IconButton>
          <IconButton label="Close" shortcut="Esc" className="size-7" onClick={() => app.closeEditor()}>
            <X />
          </IconButton>
        </header>
        {quote && (
          <blockquote className="max-h-28 overflow-auto border-l-[3px] pl-2.5 font-serif text-[13px] text-muted-foreground select-text">
            {quote.length > QUOTE_PREVIEW_CHARS ? `${quote.slice(0, QUOTE_PREVIEW_CHARS)}…` : quote}
          </blockquote>
        )}
        <Swatches size="sm" value={annotation.color} onChange={(color) => store.update(annotation.id, { color })} />
        <textarea
          ref={textarea}
          rows={4}
          placeholder={annotation.type === 'note' ? 'Write a note…' : 'Add a comment…'}
          defaultValue={annotation.comment ?? ''}
          key={annotation.id}
          // Comments save as you type; one undo step per keystroke would be noise.
          onChange={(e) => store.update(annotation.id, { comment: e.target.value }, { undoable: false })}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) app.closeEditor();
          }}
          className="min-h-20 resize-y rounded-md border bg-muted px-2.5 py-2 text-[13px] outline-none select-text focus:border-primary focus:bg-background"
        />
      </PopoverContent>
    </Popover>
  );
}
