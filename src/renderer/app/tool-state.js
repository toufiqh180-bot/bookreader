/**
 * The active annotation tool and its per-tool colour and stroke width,
 * remembered in preferences.
 *
 * Events: 'change'
 */
import { Emitter } from '../lib/util.js';

export const TOOLS = {
  select: { label: 'Select', icon: 'cursor', key: 'V' },
  highlight: { label: 'Highlight', icon: 'highlight', key: 'H', markup: true },
  underline: { label: 'Underline', icon: 'underline', key: 'U', markup: true },
  squiggly: { label: 'Squiggly underline', icon: 'squiggly', markup: true },
  strikeout: { label: 'Strikethrough', icon: 'strike', key: 'S', markup: true },
  note: { label: 'Sticky note', icon: 'note', key: 'N' },
  pen: { label: 'Pen', icon: 'pen', key: 'P', ink: true },
  marker: { label: 'Highlighter pen', icon: 'marker', key: 'M', ink: true },
  eraser: { label: 'Eraser', icon: 'eraser', key: 'E' },
};

export const PALETTE = ['#FFEB3B', '#8BE07A', '#64B5F6', '#F48FB1', '#FFB74D', '#B39DDB', '#FF5722', '#212121'];

const DEFAULT_COLORS = { highlight: '#FFEB3B', underline: '#64B5F6', squiggly: '#FF5722', strikeout: '#FF5722', note: '#FFEB3B', pen: '#FF5722', marker: '#FFEB3B' };
const DEFAULT_WIDTHS = { pen: 2, marker: 12 };

export class ToolState extends Emitter {
  /** @param {import('./preferences.js').Preferences} prefs */
  constructor(prefs) {
    super();
    this.prefs = prefs;
    this.current = 'select';
  }

  get isMarkup() {
    return Boolean(TOOLS[this.current].markup);
  }

  get isInk() {
    return Boolean(TOOLS[this.current].ink);
  }

  set(tool) {
    if (!TOOLS[tool] || tool === this.current) return;
    this.current = tool;
    this.emit('change');
  }

  colorFor(tool = this.current) {
    return this.prefs.get('toolColors')?.[tool] ?? DEFAULT_COLORS[tool] ?? PALETTE[0];
  }

  setColor(color, tool = this.current) {
    this.prefs.set('toolColors', { ...this.prefs.get('toolColors'), [tool]: color });
    this.emit('change');
  }

  widthFor(tool = this.current) {
    return this.prefs.get('toolWidths')?.[tool] ?? DEFAULT_WIDTHS[tool] ?? 2;
  }

  setWidth(width, tool = this.current) {
    this.prefs.set('toolWidths', { ...this.prefs.get('toolWidths'), [tool]: width });
    this.emit('change');
  }
}
