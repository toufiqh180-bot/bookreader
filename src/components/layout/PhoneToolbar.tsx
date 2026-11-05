/**
 * The bottom bar on phones: six equal, labelled buttons that always fit the
 * screen, so nothing scrolls sideways or slides out of view.
 *
 *   Select · Mark · Draw · Listen · Undo · Redo
 *
 * Mark and Draw each stand for a group of tools. Tapping one picks the tool
 * last used in that group; tapping it again opens the group, with colours and
 * line weight. Every tool from the desktop rail is still here.
 */
import { useState, type ComponentProps } from 'react';
import { ChevronUp, Headphones, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { TOOL_GROUPS, TOOL_ICONS, ToolStyle, isStyleable } from './ToolRail.tsx';
import { useAppState, useCommand } from '../../hooks/use-app.ts';
import { TOOLS } from '../../app/tool-state.ts';
import type { Tool } from '../../engine/annotations/annotation-controller.ts';

const [, MARK_TOOLS, DRAW_TOOLS] = TOOL_GROUPS;

/** Labels short enough for a phone-width slot. */
const SHORT_LABELS: Record<Tool, string> = {
  select: 'Select',
  highlight: 'Highlight',
  underline: 'Underline',
  squiggly: 'Squiggly',
  strikeout: 'Strike',
  note: 'Note',
  pen: 'Pen',
  marker: 'Marker',
  eraser: 'Eraser',
};

export function PhoneToolbar() {
  const state = useAppState();
  const run = useCommand();
  const SelectIcon = TOOL_ICONS.select;

  return (
    // touch-none: swipes on the bar never scroll or drag it; taps still work.
    <nav
      aria-label="Tools"
      data-chrome="bottom"
      className="grid shrink-0 touch-none grid-cols-6 border-t bg-sidebar px-1 pb-[env(safe-area-inset-bottom)] select-none"
    >
      <Slot icon={SelectIcon} label="Select" active={state.tool === 'select'} onClick={() => run('tool.set', 'select')} />
      <ToolGroup label="Mark" tools={MARK_TOOLS} fallback="highlight" />
      <ToolGroup label="Draw" tools={DRAW_TOOLS} fallback="pen" />
      <Slot icon={Headphones} label="Listen" active={state.readAloud.status !== 'idle'} onClick={() => run('speech.toggle')} />
      <Slot icon={Undo2} label="Undo" onClick={() => run('edit.undo')} />
      <Slot icon={Redo2} label="Redo" onClick={() => run('edit.redo')} />
    </nav>
  );
}

interface SlotProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  /** Shows a small chevron: tapping again opens more choices. */
  more?: boolean;
}

function Slot({ icon: Icon, label, active = false, more = false, className, ...props }: SlotProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground active:opacity-70',
        active && 'text-accent-foreground',
        className,
      )}
      {...props}
    >
      <span className={cn('relative grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-accent')}>
        <Icon className="size-[21px]" strokeWidth={1.9} />
        {more && <ChevronUp className="absolute -top-1 right-0.5 size-3 opacity-70" />}
      </span>
      {label}
    </button>
  );
}

/** One slot standing for several tools; a second tap opens them. */
function ToolGroup({ label, tools, fallback }: { label: string; tools: Tool[]; fallback: Tool }) {
  const state = useAppState();
  const run = useCommand();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Tool>(fallback);
  const active = tools.includes(state.tool);
  const current = active ? state.tool : last;

  // Remember the last tool used in this group, however it was chosen (rail, shortcut, menu).
  if (active && state.tool !== last) setLast(state.tool);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Slot
          icon={TOOL_ICONS[current]}
          label={active ? SHORT_LABELS[current] : label}
          active={active}
          more={active}
          aria-haspopup="dialog"
          onClick={() => (active ? setOpen((o) => !o) : run('tool.set', current))}
        />
      </PopoverAnchor>
      <PopoverContent side="top" sideOffset={6} className="flex w-[min(92vw,340px)] flex-col gap-4 p-3">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tools.length}, minmax(0, 1fr))` }}>
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool];
            return (
              <button
                key={tool}
                type="button"
                aria-pressed={state.tool === tool}
                title={TOOLS[tool].label}
                onClick={() => run('tool.set', tool)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-muted-foreground',
                  state.tool === tool ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-5" />
                {SHORT_LABELS[tool]}
              </button>
            );
          })}
        </div>
        {isStyleable(state.tool) && <ToolStyle />}
      </PopoverContent>
    </Popover>
  );
}
