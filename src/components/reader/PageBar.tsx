/**
 * Floating controls over the document: the page pill (history, page number,
 * zoom, fit), the auto-scroll pill while it runs, and a hairline
 * reading-progress bar along the top edge.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minus, MoveHorizontal, Pause, Play, Plus, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/cn';
import { IconButton } from '../common/IconButton.tsx';
import { useAppState, useCommand } from '../../hooks/use-app.ts';
import { MAX_SPEED, MIN_SPEED } from '../../engine/auto-scroller.ts';

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300];
const pill =
  'pointer-events-auto flex h-11 items-center gap-0.5 rounded-full border bg-popover/90 px-1.5 shadow-floating backdrop-blur-xl backdrop-saturate-150';

export function PageBar() {
  const state = useAppState();
  const run = useCommand();
  // What the reader is typing into the page box; null shows the current page.
  const [draft, setDraft] = useState<string | null>(null);

  if (!state.book) return null;
  const fraction = state.pageCount > 1 ? (state.page - 1) / (state.pageCount - 1) : 1;
  const fitsWidth = state.zoomMode === 'fit-width';
  const { autoScroll } = state;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute inset-x-0 top-0 h-[3px]" title={`${Math.round(fraction * 100)}% read`}>
        <div className="h-full rounded-r-full bg-primary transition-[width] duration-300" style={{ width: `${fraction * 100}%` }} />
      </div>

      <div className="absolute bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2.5">
        {autoScroll.active && (
          <div className={pill}>
            <span className="px-2 font-medium">Auto-scroll</span>
            <IconButton
              label={autoScroll.paused ? 'Resume' : 'Pause'}
              shortcut="Space"
              tooltipSide="top"
              className="size-8 rounded-full"
              onClick={() => run('view.toggleAutoScrollPause')}
            >
              {autoScroll.paused ? <Play /> : <Pause />}
            </IconButton>
            <Slider
              className="mx-2 w-28"
              value={[autoScroll.speed]}
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={5}
              onValueChange={([v]) => run('view.autoScrollSpeed', v)}
              aria-label="Auto-scroll speed"
            />
            <span className="w-16 text-muted-foreground tabular-nums">{autoScroll.speed} px/s</span>
            <IconButton label="Stop" shortcut="Esc" tooltipSide="top" className="size-8 rounded-full" onClick={() => run('view.toggleAutoScroll')}>
              <X />
            </IconButton>
          </div>
        )}

        <div className={pill}>
          <IconButton label="Back" shortcut="⌘[" tooltipSide="top" className="size-8 rounded-full" disabled={!state.canGoBack} onClick={() => run('nav.back')}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Forward"
            shortcut="⌘]"
            tooltipSide="top"
            className="size-8 rounded-full"
            disabled={!state.canGoForward}
            onClick={() => run('nav.forward')}
          >
            <ChevronRight />
          </IconButton>
          <div className="mx-1.5 h-5 w-px bg-border" />
          <div className="flex items-center gap-1.5 px-1 text-muted-foreground tabular-nums">
            <input
              data-page-input
              aria-label="Page number"
              inputMode="numeric"
              value={draft ?? state.pageLabel}
              onFocus={(e) => {
                setDraft(state.pageLabel);
                e.target.select();
              }}
              onBlur={() => setDraft(null)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  run('nav.goTo', draft ?? '');
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') e.currentTarget.blur();
              }}
              className="h-7 w-12 rounded-md border bg-muted text-center font-semibold text-foreground outline-none focus:border-primary focus:bg-background"
            />
            <span className="whitespace-nowrap">of {state.pageCount}</span>
          </div>
          <div className="mx-1.5 h-5 w-px bg-border" />
          <IconButton
            label={state.reflow ? 'Smaller text' : 'Zoom out'}
            shortcut="⌘−"
            tooltipSide="top"
            className="size-8 rounded-full"
            onClick={() => run('view.zoomOut')}
          >
            <Minus />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={state.reflow}>
              <button type="button" className="h-8 min-w-14 rounded-full px-1.5 font-medium tabular-nums hover:bg-muted">
                {state.reflow ? `${state.reflowSettings.size}px` : `${state.zoomPercent}%`}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" className="w-44">
              <DropdownMenuCheckboxItem checked={state.zoomMode === 'auto'} onClick={() => run('view.zoomMode', 'auto')}>
                Automatic
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={state.zoomMode === 'fit-page'} onClick={() => run('view.fitPage')}>
                Fit page
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={fitsWidth} onClick={() => run('view.fitWidth')}>
                Fit width
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {ZOOM_PRESETS.map((p) => (
                <DropdownMenuCheckboxItem key={p} checked={state.zoomMode === 'custom' && state.zoomPercent === p} onClick={() => run('view.zoomTo', p / 100)}>
                  {p}%
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton
            label={state.reflow ? 'Larger text' : 'Zoom in'}
            shortcut="⌘+"
            tooltipSide="top"
            className="size-8 rounded-full"
            onClick={() => run('view.zoomIn')}
          >
            <Plus />
          </IconButton>
          {!state.reflow && (
            <IconButton
              label={fitsWidth ? 'Fit page' : 'Fit width'}
              shortcut={fitsWidth ? '⌘0' : '⌘9'}
              tooltipSide="top"
              className={cn('size-8 rounded-full')}
              onClick={() => run(fitsWidth ? 'view.fitPage' : 'view.fitWidth')}
            >
              {fitsWidth ? <Maximize /> : <MoveHorizontal />}
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
