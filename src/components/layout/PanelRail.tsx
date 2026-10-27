/**
 * Icon rail on the right edge. Each icon opens its panel in the side panel;
 * clicking the active icon closes it.
 */
import { Bookmark, LayoutGrid, List, MessageSquareText, Search, type LucideIcon } from 'lucide-react';
import { IconButton } from '../common/IconButton.tsx';
import { useAppState, useCommand } from '../../hooks/use-app.ts';
import type { PanelId } from '../../app/app-controller.ts';

export const PANELS: Array<{ id: PanelId; title: string; icon: LucideIcon; shortcut?: string }> = [
  { id: 'outline', title: 'Contents', icon: List },
  { id: 'thumbnails', title: 'Pages', icon: LayoutGrid },
  { id: 'notes', title: 'Comments', icon: MessageSquareText },
  { id: 'bookmarks', title: 'Bookmarks', icon: Bookmark },
  { id: 'search', title: 'Search', icon: Search, shortcut: '⌘F' },
];

export function PanelRail() {
  const state = useAppState();
  const run = useCommand();
  return (
    <nav aria-label="Panels" className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-l bg-sidebar py-2.5">
      {PANELS.map(({ id, title, icon: Icon, shortcut }) => (
        <IconButton
          key={id}
          label={title}
          shortcut={shortcut}
          tooltipSide="left"
          active={state.sidebar.open && state.sidebar.panel === id}
          disabled={!state.book}
          onClick={() => run('view.panel', id)}
          className="size-[38px] rounded-[10px]"
        >
          <Icon />
        </IconButton>
      ))}
    </nav>
  );
}
