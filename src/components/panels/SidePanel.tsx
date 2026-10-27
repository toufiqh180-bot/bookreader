/**
 * The side panel showing one of: contents, pages, comments, bookmarks,
 * search. Docked beside the document on wide screens; a slide-over sheet on
 * phones.
 */
import { X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IconButton } from '../common/IconButton.tsx';
import { useApp, useAppState } from '../../hooks/use-app.ts';
import { useCompactLayout } from '../../hooks/use-media-query.ts';
import { PANELS } from '../layout/PanelRail.tsx';
import { OutlinePanel } from './OutlinePanel.tsx';
import { ThumbnailsPanel } from './ThumbnailsPanel.tsx';
import { NotesPanel } from './NotesPanel.tsx';
import { BookmarksPanel } from './BookmarksPanel.tsx';
import { SearchPanel } from './SearchPanel.tsx';
import type { PanelId } from '../../app/app-controller.ts';

function PanelBody() {
  const { book, pane, page, sidebar } = useAppState();
  if (!book || !pane) return null;
  const props = { book, pane, currentPage: page };
  switch (sidebar.panel) {
    case 'outline':
      return <OutlinePanel {...props} />;
    case 'thumbnails':
      return <ThumbnailsPanel {...props} />;
    case 'notes':
      return <NotesPanel {...props} />;
    case 'bookmarks':
      return <BookmarksPanel {...props} />;
    case 'search':
      return <SearchPanel {...props} />;
  }
}

export function SidePanel() {
  const app = useApp();
  const state = useAppState();
  const compact = useCompactLayout();
  const title = PANELS.find((p) => p.id === state.sidebar.panel)?.title ?? '';
  if (!state.book) return null;

  if (compact) {
    return (
      <Sheet open={state.sidebar.open} onOpenChange={(open) => app.setSidebar(open)}>
        <SheetContent side="bottom" className="h-[80dvh] gap-0 p-0">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <ToggleGroup
            type="single"
            value={state.sidebar.panel}
            onValueChange={(id) => id && app.setSidebar(true, id as PanelId)}
            className="grid w-full grid-cols-5 border-b p-2 pr-10"
          >
            {PANELS.map(({ id, title: label, icon: Icon }) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="flex h-auto flex-col gap-1 py-1.5 text-[10px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
              >
                <Icon className="size-[18px]" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ScrollArea className="min-h-0 flex-1">
            <PanelBody />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  if (!state.sidebar.open) return null;
  return (
    <aside className="flex shrink-0 flex-col border-l bg-background" style={{ width: app.prefs.get('sidebarWidth') }} aria-label={title}>
      <header className="flex h-12 shrink-0 items-center justify-between border-b pr-2 pl-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <IconButton label="Close panel" shortcut="⌘B" className="size-7" onClick={() => app.setSidebar(false)}>
          <X />
        </IconButton>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <PanelBody />
      </ScrollArea>
    </aside>
  );
}
