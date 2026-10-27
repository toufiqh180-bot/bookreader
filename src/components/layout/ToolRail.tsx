/**
 * Annotation tools. A vertical rail on the left edge on desktop/tablet (the
 * "quick tools" strip of modern PDF editors); a horizontal bar along the
 * bottom on phones. Includes the active tool's colour and undo/redo.
 */
import { Brush, Eraser, Highlighter, MousePointer2, PenLine, Redo2, StickyNote, Strikethrough, Underline, Undo2, Waves, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/cn';
import { IconButton } from '../common/IconButton.tsx';
import { Swatches } from '../common/Swatches.tsx';
import { useAppState, useCommand } from '../../hooks/use-app.ts';
import { TOOLS } from '../../app/tool-state.ts';
import type { Tool } from '../../engine/annotations/annotation-controller.ts';

const ICONS: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  highlight: Highlighter,
  underline: Underline,
  squiggly: Waves,
  strikeout: Strikethrough,
  note: StickyNote,
  pen: PenLine,
  marker: Brush,
  eraser: Eraser,
};

/** Tools grouped as shown, separated by dividers. */
const GROUPS: Tool[][] = [['select'], ['highlight', 'underline', 'squiggly', 'strikeout', 'note'], ['pen', 'marker', 'eraser']];

export function ToolRail({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const state = useAppState();
  const run = useCommand();
  const vertical = orientation === 'vertical';
  const tooltipSide = vertical ? 'right' : 'top';
  const disabled = !state.book;
  const styleable = !['select', 'eraser'].includes(state.tool);
  const divider = <div className={cn('shrink-0 bg-border', vertical ? 'mx-auto my-1.5 h-px w-6' : 'mx-1 h-6 w-px')} />;

  return (
    <nav
      aria-label="Annotation tools"
      className={cn(
        'flex shrink-0 items-center bg-sidebar',
        // Horizontal: a scrollable row. Auto margins on the first/last child centre it when it
        // fits; unlike justify-center, they never push the first tools out of reach.
        vertical
          ? 'w-[52px] flex-col border-r py-2.5'
          : 'h-14 gap-0.5 overflow-x-auto border-t px-2 pb-[env(safe-area-inset-bottom)] [&>:first-child]:ml-auto [&>:last-child]:mr-auto',
        disabled && '[&_.tool]:pointer-events-none [&_.tool]:opacity-35',
      )}
    >
      {GROUPS.map((group, i) => (
        <div key={group.join()} className={cn('flex gap-1', vertical ? 'flex-col' : 'items-center')}>
          {i > 0 && divider}
          {group.map((tool) => {
            const Icon = ICONS[tool];
            return (
              <IconButton
                key={tool}
                label={TOOLS[tool].label}
                shortcut={TOOLS[tool].key}
                tooltipSide={tooltipSide}
                active={state.tool === tool}
                onClick={() => run('tool.set', tool)}
                className="tool size-[38px] rounded-[10px]"
              >
                <Icon />
              </IconButton>
            );
          })}
        </div>
      ))}
      {divider}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Colour and line weight"
            disabled={disabled || !styleable}
            className="tool grid size-[38px] shrink-0 place-items-center rounded-[10px] hover:bg-muted disabled:opacity-35"
          >
            <span
              className="size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15),0_0_0_2px_var(--sidebar),0_0_0_3px_var(--border)]"
              style={{ background: state.toolColor }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent side={vertical ? 'right' : 'top'} className="flex w-64 flex-col gap-4">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{TOOLS[state.tool].label}</h3>
          <Swatches value={state.toolColor} onChange={(color) => run('tool.color', color)} />
          {TOOLS[state.tool].ink && (
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <span>Line weight</span>
                <span className="text-muted-foreground tabular-nums">{state.toolWidth}</span>
              </div>
              <Slider
                value={[state.toolWidth]}
                min={state.tool === 'marker' ? 4 : 0.5}
                max={state.tool === 'marker' ? 30 : 12}
                step={0.5}
                onValueChange={([w]) => run('tool.width', w)}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
      {vertical && <div className="flex-1" />}
      {vertical ? null : divider}
      <div className={cn('flex gap-1', vertical ? 'flex-col' : 'items-center')}>
        <IconButton
          label="Undo"
          shortcut="⌘Z"
          tooltipSide={tooltipSide}
          onClick={() => run('edit.undo')}
          disabled={disabled}
          className="size-[38px] rounded-[10px]"
        >
          <Undo2 />
        </IconButton>
        <IconButton
          label="Redo"
          shortcut="⇧⌘Z"
          tooltipSide={tooltipSide}
          onClick={() => run('edit.redo')}
          disabled={disabled}
          className="size-[38px] rounded-[10px]"
        >
          <Redo2 />
        </IconButton>
      </div>
    </nav>
  );
}
