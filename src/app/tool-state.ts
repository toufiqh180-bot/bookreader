/**
 * The active annotation tool plus each tool's colour and line weight
 * (remembered in preferences). Emits `change`.
 */
import { Emitter } from '../lib/util.ts';
import type { Tool, ToolSettings } from '../engine/annotations/annotation-controller.ts';
import type { Preferences } from './preferences.ts';

export interface ToolInfo {
  label: string;
  /** Keyboard shortcut (single key). */
  key?: string;
  markup?: boolean;
  ink?: boolean;
}

export const TOOLS: Record<Tool, ToolInfo> = {
  select: { label: 'Select', key: 'V' },
  highlight: { label: 'Highlight', key: 'H', markup: true },
  underline: { label: 'Underline', key: 'U', markup: true },
  squiggly: { label: 'Squiggly underline', markup: true },
  strikeout: { label: 'Strikethrough', key: 'S', markup: true },
  note: { label: 'Sticky note', key: 'N' },
  pen: { label: 'Pen', key: 'P', ink: true },
  marker: { label: 'Highlighter pen', key: 'M', ink: true },
  eraser: { label: 'Eraser', key: 'E' },
};

export const PALETTE = ['#FFEB3B', '#8BE07A', '#64B5F6', '#F48FB1', '#FFB74D', '#B39DDB', '#FF5722', '#212121'];

const DEFAULT_COLORS: Partial<Record<Tool, string>> = {
  highlight: '#FFEB3B',
  underline: '#64B5F6',
  squiggly: '#FF5722',
  strikeout: '#FF5722',
  note: '#FFEB3B',
  pen: '#FF5722',
  marker: '#FFEB3B',
};
const DEFAULT_WIDTHS: Partial<Record<Tool, number>> = { pen: 2, marker: 12 };

export class ToolState extends Emitter<{ change: [] }> implements ToolSettings {
  #current: Tool = 'select';
  readonly #prefs: Preferences;

  constructor(prefs: Preferences) {
    super();
    this.#prefs = prefs;
  }

  current(): Tool {
    return this.#current;
  }

  set(tool: Tool): void {
    if (!(tool in TOOLS) || tool === this.#current) return;
    this.#current = tool;
    this.emit('change');
  }

  colorFor(tool: Tool = this.#current): string {
    return this.#prefs.get('toolColors')[tool] ?? DEFAULT_COLORS[tool] ?? PALETTE[0];
  }

  setColor(color: string, tool: Tool = this.#current): void {
    this.#prefs.set('toolColors', { ...this.#prefs.get('toolColors'), [tool]: color });
    this.emit('change');
  }

  widthFor(tool: Tool = this.#current): number {
    return this.#prefs.get('toolWidths')[tool] ?? DEFAULT_WIDTHS[tool] ?? 2;
  }

  setWidth(width: number, tool: Tool = this.#current): void {
    this.#prefs.set('toolWidths', { ...this.#prefs.get('toolWidths'), [tool]: width });
    this.emit('change');
  }
}
