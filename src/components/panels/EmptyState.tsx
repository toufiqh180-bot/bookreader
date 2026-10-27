import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      {children && <p className="leading-relaxed">{children}</p>}
    </div>
  );
}
