/** A row of colour swatches; the selected one is ringed. */
import { cn } from '@/lib/cn';
import { PALETTE } from '../../app/tool-state.ts';

export function Swatches({
  value,
  onChange,
  colors = PALETTE,
  size = 'md',
}: {
  value?: string;
  onChange: (color: string) => void;
  colors?: string[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color.toLowerCase() === value?.toLowerCase()}
          aria-label={color}
          onClick={() => onChange(color)}
          style={{ background: color }}
          className={cn(
            'rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] transition-transform hover:scale-110',
            size === 'sm' ? 'size-5' : 'size-6',
            color.toLowerCase() === value?.toLowerCase() && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
          )}
        />
      ))}
    </div>
  );
}
