/**
 * Top bar: Home + book tabs on the left; View, search, bookmark, Export and
 * the overflow menu on the right. On the desktop app it doubles as the window
 * title bar (draggable, with room for the macOS traffic lights).
 */
import { Bookmark, ChevronDown, Eye, FileText, Link2, MoreHorizontal, PanelRight, Plus, ScanText, Search, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { IconButton } from '../common/IconButton.tsx';
import { Logo } from '../common/Logo.tsx';
import { ViewMenu } from './ViewMenu.tsx';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { useCompactLayout } from '../../hooks/use-media-query.ts';

export function TopBar() {
  const app = useApp();
  const state = useAppState();
  const run = useCommand();
  const compact = useCompactLayout();
  const isDesktopMac = app.platform.kind === 'electron' && app.platform.isMac;
  const hasBook = Boolean(state.book);

  return (
    <header className={cn('app-region-drag flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2', isDesktopMac && 'pl-[84px]')}>
      <nav className="flex min-w-0 flex-1 items-center gap-1" role="tablist" aria-label="Open books">
        <TabButton active={!hasBook} onClick={() => run('file.library')} label="Library">
          <Logo className="size-5" />
          {!compact && <span>Library</span>}
        </TabButton>
        <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          {state.tabs.map((tab) => (
            <TabButton
              key={tab.id}
              active={tab.id === state.activeTabId}
              onClick={() => app.selectTab(app.tabs.find((t) => t.id === tab.id)!)}
              label={tab.title}
            >
              <FileText className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{tab.title}</span>
              <span
                role="button"
                aria-label={`Close ${tab.title}`}
                className="grid size-5 shrink-0 place-items-center rounded opacity-50 hover:bg-muted hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  void app.closeTab(app.tabs.find((t) => t.id === tab.id)!);
                }}
              >
                <X className="size-3" />
              </span>
            </TabButton>
          ))}
        </div>
        <IconButton label="Open PDF" shortcut="⌘O" onClick={() => run('file.open')} className="size-8 shrink-0">
          <Plus />
        </IconButton>
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        {hasBook && (
          <>
            <ViewMenu
              trigger={
                <Button variant="ghost" size={compact ? 'icon' : 'sm'} className="gap-1.5 font-medium">
                  <Eye className="size-[18px]" />
                  {!compact && (
                    <>
                      View <ChevronDown className="size-3.5 opacity-60" />
                    </>
                  )}
                </Button>
              }
            />
            {!compact && (
              <>
                <IconButton label="Find" shortcut="⌘F" onClick={() => run('nav.find')}>
                  <Search />
                </IconButton>
                <IconButton
                  label={state.bookmarked ? 'Remove bookmark' : 'Bookmark page'}
                  shortcut="⌘D"
                  active={state.bookmarked}
                  onClick={() => run('nav.toggleBookmark')}
                >
                  <Bookmark className={cn(state.bookmarked && 'fill-current')} />
                </IconButton>
              </>
            )}
            {compact && (
              <IconButton label="Panels" onClick={() => run('view.toggleSidebar')}>
                <PanelRight />
              </IconButton>
            )}
            <div className="mx-1 h-5 w-px bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="rounded-full px-4 font-semibold">
                  <Share className="size-4" />
                  {!compact && 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => run('export.annotations', 'md')}>Notes as Markdown…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('export.annotations', 'json')}>Notes as JSON…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('export.annotations', 'txt')}>Notes as plain text…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => run('export.flattened')}>
                  PDF with annotations… <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('export.searchable')}>Searchable PDF (OCR text)…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => run('nav.copyLink')}>
                  <Link2 /> Copy link to this spot
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More" className="text-muted-foreground">
              <MoreHorizontal className="size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => run('file.open')}>
              Open PDF… <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run('file.library')}>Library</DropdownMenuItem>
            {hasBook && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => run('nav.goToPage')}>
                  Go to page… <DropdownMenuShortcut>⌘G</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('tools.ocr', 'page')}>
                  <ScanText /> Recognize text on this page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('tools.ocr', 'all')}>
                  <ScanText /> Recognize text in whole book
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run('tools.recomputeCrop')}>Recompute margin crop</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => run('help.shortcuts')}>
              Keyboard shortcuts <DropdownMenuShortcut>⌘/</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function TabButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-8 max-w-60 shrink-0 items-center gap-2 rounded-lg px-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      {children}
    </button>
  );
}
