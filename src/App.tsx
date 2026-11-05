/**
 * App layout:
 *
 *   ┌ TopBar: Home · tabs ······················ View · Find · Export · ⋯ ┐
 *   ├ ToolRail ┬ Workspace (document, page bar, popovers) ┬ SidePanel ┬ PanelRail ┤
 *
 * On phones the ToolRail moves to a bottom bar and the side panel becomes a
 * sheet; the PanelRail is replaced by a button in the top bar.
 */
import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TopBar } from './components/layout/TopBar.tsx';
import { ToolRail } from './components/layout/ToolRail.tsx';
import { PhoneToolbar } from './components/layout/PhoneToolbar.tsx';
import { PanelRail } from './components/layout/PanelRail.tsx';
import { Workspace } from './components/reader/Workspace.tsx';
import { SidePanel } from './components/panels/SidePanel.tsx';
import { ShortcutsDialog } from './components/common/ShortcutsDialog.tsx';
import { useApp, useAppState } from './hooks/use-app.ts';
import { useCompactLayout } from './hooks/use-media-query.ts';

/** In focus mode, moving the mouse this close to the top or bottom edge shows the bars. */
const EDGE_REVEAL_PX = 24;

export function App() {
  const app = useApp();
  const { darkChrome, book, chromeHidden, focus } = useAppState();
  const compact = useCompactLayout();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkChrome);
    // Native controls (scrollbars, inputs, pickers) follow the app's appearance too.
    document.documentElement.style.colorScheme = darkChrome ? 'dark' : 'light';
  }, [darkChrome]);

  // Focus mode and tap-to-hide: the bars slide away (globals.css), leaving the book.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-chrome-hidden', chromeHidden);
  }, [chromeHidden]);

  useEffect(() => {
    if (!focus) return;
    // Using the bars (or a menu opened from them) keeps them up a while longer.
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element).closest('[data-chrome], [data-radix-popper-content-wrapper]')) app.keepBars();
    };
    // With a mouse, the window's top or bottom edge brings them back too.
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < EDGE_REVEAL_PX || e.clientY > window.innerHeight - EDGE_REVEAL_PX) app.revealBars();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [app, focus]);

  // The host may deliver files/links (e.g. "Open with BookReader") once the UI exists.
  useEffect(() => app.platform.signalReady(), [app]);

  return (
    <TooltipProvider delayDuration={450}>
      <div className="flex h-dvh flex-col">
        <TopBar />
        <main className="flex min-h-0 flex-1">
          {!compact && <ToolRail />}
          <Workspace />
          <SidePanel />
          {!compact && <PanelRail />}
        </main>
        {/* On phones the bottom tool bar only makes sense with a book open. */}
        {compact && book && <PhoneToolbar />}
      </div>
      <ShortcutsDialog />
      <Toaster position="top-right" theme={darkChrome ? 'dark' : 'light'} offset={{ top: 60, right: 64 }} mobileOffset={{ top: 56 }} />
    </TooltipProvider>
  );
}
