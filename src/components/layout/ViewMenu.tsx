/**
 * The "View" popover: everything about how the book is displayed, in one
 * place — layout, page turns, reflow typography, theme and display toggles.
 */
import type { ReactNode } from 'react';
import { BookOpen, File, Rows3, AlignLeft } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { THEMES } from '../../app/themes.ts';
import { REFLOW_FONTS, type ReflowFont } from '../../engine/reflow-view.ts';
import type { PageTransition } from '../../engine/layouts/page-turn.ts';

const LAYOUTS = [
  { id: 'continuous', label: 'Scroll', icon: Rows3 },
  { id: 'single', label: 'Page', icon: File },
  { id: 'two-page', label: 'Spread', icon: BookOpen },
  { id: 'reflow', label: 'Reflow', icon: AlignLeft },
] as const;

const TRANSITIONS: Array<{ id: PageTransition; label: string }> = [
  { id: 'curl', label: 'Turn' },
  { id: 'slide', label: 'Slide' },
  { id: 'none', label: 'None' },
];

/** Theme swatch colours (page background, text) for the picker. */
const THEME_SAMPLES: Record<string, [string, string]> = {
  light: ['#ffffff', '#111111'],
  sepia: ['#f3e2bf', '#3b2f1e'],
  dark: ['#1a1a1a', '#e6e6e6'],
  night: ['#141210', '#e6c79c'],
  mono: ['#ffffff', '#000000'],
  custom: ['#d8e8d0', '#222222'],
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={cn('flex min-h-7 items-center justify-between gap-3', disabled && 'opacity-50')}>
      <span className="flex items-baseline gap-2">
        {label}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

export function ViewMenu({ trigger }: { trigger: ReactNode }) {
  const app = useApp();
  const state = useAppState();
  const run = useCommand();
  const current = state.reflow ? 'reflow' : state.mode;
  const settings = state.reflowSettings;
  const tint = app.prefs.get('customTint');

  const setLayout = (id: string) => {
    if (!id || id === current) return;
    if (id === 'reflow') run('view.toggleReflow');
    else run('view.mode', id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[calc(100dvh-80px)] w-[340px] flex-col gap-5 overflow-y-auto p-4 text-[13px]">
        <Section title="Layout">
          <ToggleGroup type="single" value={current} onValueChange={setLayout} variant="outline" className="grid w-full grid-cols-4">
            {LAYOUTS.map(({ id, label, icon: Icon }) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="flex h-auto flex-col gap-1 py-2 text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
              >
                <Icon className="size-[18px]" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {state.mode !== 'continuous' && !state.reflow && (
            <div className="flex items-center justify-between">
              <span>Page turn</span>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={app.prefs.get('pageTransition')}
                onValueChange={(v) => v && run('view.pageTransition', v)}
              >
                {TRANSITIONS.map((t) => (
                  <ToggleGroupItem key={t.id} value={t.id} className="px-3 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
                    {t.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        </Section>

        {state.reflow && (
          <Section title="Text">
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.entries(REFLOW_FONTS) as Array<[ReflowFont, (typeof REFLOW_FONTS)[ReflowFont]]>).map(([id, font]) => (
                <button
                  key={id}
                  type="button"
                  title={font.label}
                  onClick={() => run('view.reflowSettings', { font: id })}
                  style={{ fontFamily: font.stack }}
                  className={cn('h-10 rounded-md border text-lg', settings.font === id && 'border-primary text-primary ring-1 ring-primary')}
                >
                  Ag
                </button>
              ))}
            </div>
            <LabeledSlider
              label="Size"
              value={settings.size}
              min={12}
              max={36}
              step={1}
              format={(v) => `${v}px`}
              onChange={(size) => run('view.reflowSettings', { size })}
            />
            <LabeledSlider
              label="Line spacing"
              value={settings.lineHeight}
              min={1.1}
              max={2.4}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(lineHeight) => run('view.reflowSettings', { lineHeight })}
            />
            <LabeledSlider
              label="Column width"
              value={settings.width}
              min={420}
              max={1100}
              step={10}
              format={(v) => `${v}px`}
              onChange={(width) => run('view.reflowSettings', { width })}
            />
            <SwitchRow
              label="Justify text"
              checked={settings.align === 'justify'}
              onChange={() => run('view.reflowSettings', { align: settings.align === 'justify' ? 'left' : 'justify' })}
            />
          </Section>
        )}

        <Section title="Theme">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((theme) => {
              const [bg, fg] = THEME_SAMPLES[theme.id];
              const active = theme.id === state.theme;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => run('view.theme', theme.id)}
                  className={cn('flex flex-col items-center gap-1 text-[11px] text-muted-foreground', active && 'font-medium text-primary')}
                >
                  <span
                    className={cn(
                      'grid h-12 w-full place-items-center rounded-lg border font-serif text-lg font-semibold transition-shadow',
                      active ? 'border-primary ring-2 ring-primary' : 'hover:ring-2 hover:ring-border',
                    )}
                    style={{ background: theme.id === 'custom' ? tint.color : bg, color: fg, filter: theme.id === 'mono' ? 'contrast(1.4)' : undefined }}
                  >
                    Aa
                  </span>
                  {theme.label}
                </button>
              );
            })}
          </div>
          {state.theme === 'custom' && (
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between">
                Tint colour
                <input
                  type="color"
                  value={tint.color}
                  onChange={(e) => run('view.customTint', { ...tint, color: e.target.value })}
                  className="h-7 w-12 cursor-pointer rounded border bg-transparent"
                />
              </label>
              <LabeledSlider
                label="Brightness"
                value={tint.brightness}
                min={0.5}
                max={1.1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(brightness) => run('view.customTint', { ...tint, brightness })}
              />
            </div>
          )}
        </Section>

        <Separator />
        <section className="flex flex-col gap-1.5">
          <SwitchRow label="Smart margin crop" hint="⌘K" checked={state.crop} onChange={() => run('view.toggleCrop')} />
          <SwitchRow label="Split two-page scans" checked={state.splitSpreads} onChange={() => run('view.toggleSplitSpreads')} disabled={!state.hasSpreads} />
          <SwitchRow label="Split screen" hint="⌘\" checked={state.splitScreen} onChange={() => run('view.toggleSplit')} />
          <SwitchRow label="Auto-scroll" hint="⇧⌘A" checked={state.autoScroll.active} onChange={() => run('view.toggleAutoScroll')} />
        </section>
      </PopoverContent>
    </Popover>
  );
}
