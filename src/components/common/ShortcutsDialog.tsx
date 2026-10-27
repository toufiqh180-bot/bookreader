import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApp, useAppState } from '../../hooks/use-app.ts';
import { SHORTCUT_HELP } from '../../app/keymap.ts';

export function ShortcutsDialog() {
  const app = useApp();
  const { shortcutsOpen } = useAppState();
  return (
    <Dialog open={shortcutsOpen} onOpenChange={(open) => app.setShortcutsOpen(open)}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full text-[13px]">
          <tbody>
            {SHORTCUT_HELP.map(([action, other, mac]) => (
              <tr key={action} className="border-b last:border-0">
                <td className="py-2 pr-4">{action}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <kbd>{app.platform.isMac ? mac : other}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
