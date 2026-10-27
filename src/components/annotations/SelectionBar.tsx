/**
 * Floating toolbar above selected text (select tool only): quick highlight
 * colours, underline, squiggly, strikethrough, note, copy, link and search.
 */
import { useEffect, useState } from 'react';
import { Copy, Link2, Search, StickyNote, Strikethrough, Underline, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { IconButton } from '../common/IconButton.tsx';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { PALETTE } from '../../app/tool-state.ts';
import { selectedText } from '../../engine/annotations/text-selection.ts';
import type { MarkupType } from '../../models/types.ts';

const QUICK_COLORS = PALETTE.slice(0, 5);
const SETTLE_DELAY_MS = 150;

/** Bounding box of the current text selection inside the active pane, or null. */
function useSelectionRect(scope: HTMLElement | null, enabled: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!scope || !enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let pointerDown = false;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
        setRect(range && scope.contains(range.commonAncestorContainer) ? range.getBoundingClientRect() : null);
      }, SETTLE_DELAY_MS);
    };
    const onDown = () => (pointerDown = true);
    const onUp = () => {
      pointerDown = false;
      update();
    };
    const onChange = () => (pointerDown ? setRect(null) : update());
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('selectionchange', onChange);
    scope.addEventListener('scroll', () => setRect(null), { capture: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [scope, enabled]);
  return scope && enabled ? rect : null;
}

export function SelectionBar() {
  const app = useApp();
  const state = useAppState();
  const run = useCommand();
  const pane = state.pane;
  const rect = useSelectionRect(pane?.scroller ?? null, state.tool === 'select' && !state.reflow);
  if (!pane || !rect) return null;

  const markup = (type: MarkupType, color?: string) => run('annotate.markup', { type, color });
  return (
    <Popover open>
      <PopoverAnchor asChild>
        <div className="pointer-events-none fixed" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      </PopoverAnchor>
      <PopoverContent side="top" sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()} className="flex w-auto items-center gap-1 rounded-xl p-1.5">
        {QUICK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Highlight ${color}`}
            onClick={() => markup('highlight', color)}
            className="mx-0.5 size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] transition-transform hover:scale-115"
            style={{ background: color }}
          />
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        <IconButton label="Underline" className="size-8" onClick={() => markup('underline')}>
          <Underline />
        </IconButton>
        <IconButton label="Squiggly" className="size-8" onClick={() => markup('squiggly')}>
          <Waves />
        </IconButton>
        <IconButton label="Strikethrough" className="size-8" onClick={() => markup('strikeout')}>
          <Strikethrough />
        </IconButton>
        <IconButton label="Add note" shortcut="N" className="size-8" onClick={() => app.annotations.addNoteToSelection(pane)}>
          <StickyNote />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <IconButton label="Copy" className="size-8" onClick={() => void app.platform.copyText(selectedText()).then(() => toast.success('Copied'))}>
          <Copy />
        </IconButton>
        <IconButton label="Copy link to passage" className="size-8" onClick={() => run('nav.copyLink')}>
          <Link2 />
        </IconButton>
        <IconButton
          label="Search the book for this"
          className="size-8"
          onClick={() => {
            void app.searchFor(pane.book).run(selectedText());
            app.setSidebar(true, 'search');
          }}
        >
          <Search />
        </IconButton>
      </PopoverContent>
    </Popover>
  );
}
