/**
 * A square icon button with a tooltip (label + optional shortcut). Used by
 * every toolbar so they look and behave alike.
 */
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface IconButtonProps extends Omit<ComponentProps<typeof Button>, 'children'> {
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active = false, tooltipSide = 'bottom', className, children, ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active || undefined}
          data-active={active || undefined}
          className={cn(
            'text-muted-foreground hover:text-foreground data-[active]:bg-accent data-[active]:text-accent-foreground [&_svg]:size-[18px]',
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="flex items-center gap-2">
        {label}
        {shortcut && <kbd className="border-0 bg-background/15 text-background">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
});
