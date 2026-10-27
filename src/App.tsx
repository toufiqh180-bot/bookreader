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
import { PanelRail } from './components/layout/PanelRail.tsx';
import { Workspace } from './components/reader/Workspace.tsx';
import { SidePanel } from './components/panels/SidePanel.tsx';
import { ShortcutsDialog } from './components/common/ShortcutsDialog.tsx';
import { useApp, useAppState } from './hooks/use-app.ts';
import { useCompactLayout } from './hooks/use-media-query.ts';

export function App() {
  const app = useApp();
  const { darkChrome } = useAppState();
  const compact = useCompactLayout();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkChrome);
  }, [darkChrome]);

  // The host may deliver files/links (e.g. "Open with BookReader") once the UI exists.
  useEffect(() => app.platform.signalReady(), [app]);

  return (
    <TooltipProvider delayDuration={450}>
      <div className="flex h-dvh flex-col">
        <TopBar />
        <main className="flex min-h-0 flex-1">
          {!compact && <ToolRail orientation="vertical" />}
          <Workspace />
          <SidePanel />
          {!compact && <PanelRail />}
        </main>
        {compact && <ToolRail orientation="horizontal" />}
      </div>
      <ShortcutsDialog />
      <Toaster position="top-right" theme={darkChrome ? 'dark' : 'light'} offset={{ top: 60, right: 64 }} mobileOffset={{ top: 56 }} />
    </TooltipProvider>
  );
}
