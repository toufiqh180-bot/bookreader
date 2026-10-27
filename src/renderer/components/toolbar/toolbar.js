/**
 * Main toolbar. Stateless with respect to the book: it renders from a
 * ViewState snapshot (app.js → `viewState()`) and only dispatches command
 * ids, so every button behaves exactly like its menu item and shortcut.
 *
 * @typedef {import('../../app/app.js').ViewState} ViewState
 */
import { el } from '../common/dom.js';
import { icon } from '../common/icons.js';
import { showMenu, showPanel } from '../common/overlays.js';
import { TOOLS, PALETTE } from '../../app/tool-state.js';
import { THEMES } from '../../app/themes.js';
import { REFLOW_FONTS } from '../reader/reflow-view.js';

const MODES = [
  { id: 'continuous', icon: 'scroll', title: 'Continuous scroll' },
  { id: 'single', icon: 'page', title: 'Single page (flip)' },
  { id: 'two-page', icon: 'spread', title: 'Two-page spread' },
];

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300];

export class Toolbar {
  /**
   * @param {HTMLElement} root
   * @param {{ run: (command: string, arg?: any) => void, app: import('../../app/app.js').App }} deps
   */
  constructor(root, { run, app }) {
    this.root = root;
    this.run = run;
    this.app = app;
    this.#build();
  }

  #button(iconName, title, command, arg) {
    return el('button', { class: 'icon-btn', title, 'aria-label': title, html: icon(iconName), onclick: () => this.run(command, arg) });
  }

  #build() {
    this.backButton = this.#button('back', 'Back (⌘[ / Alt+←)', 'nav.back');
    this.forwardButton = this.#button('forward', 'Forward (⌘] / Alt+→)', 'nav.forward');

    this.pageInput = el('input', { class: 'page-input', type: 'text', inputmode: 'numeric', 'aria-label': 'Page number' });
    this.pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.run('nav.goToPage', this.pageInput.value);
        this.pageInput.blur();
      }
    });
    this.pageTotal = el('span', { class: 'page-total' });

    this.zoomButton = el('button', { class: 'zoom-label', title: 'Zoom', onclick: (e) => this.#zoomMenu(e.currentTarget) });
    this.modeButtons = MODES.map((m) => {
      const button = this.#button(m.icon, m.title, 'view.mode', m.id);
      button.dataset.mode = m.id;
      return button;
    });
    this.reflowButton = this.#button('reflow', 'Reflow text view (⌘/Ctrl+R)', 'view.toggleReflow');
    this.typographyButton = el('button', {
      class: 'text-btn typography',
      text: 'Aa',
      title: 'Text settings',
      onclick: (e) => this.#typographyPanel(e.currentTarget),
    });

    this.themeButton = el('button', { class: 'icon-btn', title: 'Theme (T)', html: icon('theme'), onclick: (e) => this.#themePanel(e.currentTarget) });
    this.cropButton = this.#button('crop', 'Smart margin crop (⌘/Ctrl+K)', 'view.toggleCrop');
    this.splitButton = this.#button('split', 'Split screen (⌘/Ctrl+\\)', 'view.toggleSplit');
    this.autoScrollButton = this.#button('play', 'Auto-scroll (⌘/Ctrl+Shift+A, Space pauses)', 'view.toggleAutoScroll');

    this.toolButtons = Object.entries(TOOLS).map(([id, tool]) => {
      const hint = tool.key ? ` (${tool.key})` : '';
      const button = el('button', {
        class: 'icon-btn tool',
        title: `${tool.label}${hint}`,
        'aria-label': tool.label,
        html: icon(tool.icon),
        onclick: () => this.run('tool.set', id),
      });
      button.dataset.tool = id;
      return button;
    });
    this.colorButton = el('button', { class: 'color-btn', title: 'Colour and width', onclick: (e) => this.#toolPanel(e.currentTarget) });
    this.moreButton = el('button', { class: 'icon-btn', title: 'More', html: icon('more'), onclick: (e) => this.#moreMenu(e.currentTarget) });

    const group = (...children) => el('div', { class: 'tb-group' }, children);
    this.bookControls = el('div', { class: 'tb-book' }, [
      group(this.backButton, this.forwardButton),
      group(this.pageInput, this.pageTotal),
      group(this.#button('minus', 'Zoom out (⌘/Ctrl −)', 'view.zoomOut'), this.zoomButton, this.#button('plus', 'Zoom in (⌘/Ctrl +)', 'view.zoomIn')),
      group(...this.modeButtons, this.reflowButton, this.typographyButton),
      group(this.themeButton, this.cropButton, this.splitButton, this.autoScrollButton),
      el('div', { class: 'spacer' }),
      group(...this.toolButtons, this.colorButton),
      group(this.moreButton),
    ]);
    this.root.replaceChildren(
      group(this.#button('sidebar', 'Toggle sidebar (⌘/Ctrl+B)', 'view.toggleSidebar'), this.#button('library', 'Library (⌘/Ctrl+L)', 'file.library')),
      this.bookControls,
    );
  }

  /** @param {ViewState} state */
  update(state) {
    this.state = state;
    this.bookControls.hidden = !state.hasBook;
    if (!state.hasBook) return;
    this.backButton.disabled = !state.canGoBack;
    this.forwardButton.disabled = !state.canGoForward;
    if (document.activeElement !== this.pageInput) this.pageInput.value = state.pageLabel;
    this.pageTotal.textContent = `/ ${state.pageCount}`;
    this.zoomButton.textContent = state.reflow ? `${state.reflowSettings.size}px` : `${state.zoomPercent}%`;
    for (const b of this.modeButtons) b.classList.toggle('active', !state.reflow && b.dataset.mode === state.mode);
    this.reflowButton.classList.toggle('active', state.reflow);
    this.typographyButton.hidden = !state.reflow;
    this.cropButton.classList.toggle('active', state.crop);
    this.splitButton.classList.toggle('active', state.split);
    this.autoScrollButton.classList.toggle('active', state.autoScroll.active);
    this.autoScrollButton.innerHTML = icon(state.autoScroll.active && !state.autoScroll.paused ? 'pause' : 'play');
    for (const b of this.toolButtons) b.classList.toggle('active', b.dataset.tool === state.tool);
    this.colorButton.style.setProperty('--swatch', state.toolColor);
    this.colorButton.disabled = ['select', 'eraser'].includes(state.tool);
  }

  // ---- Popovers -------------------------------------------------------------

  #zoomMenu(anchor) {
    const s = this.state;
    showMenu(anchor, [
      { label: 'Automatic', checked: s.zoomMode === 'auto', run: () => this.run('view.zoomMode', 'auto') },
      { label: 'Fit page', hint: '⌘0', checked: s.zoomMode === 'fit-page', run: () => this.run('view.fitPage') },
      { label: 'Fit width', hint: '⌘9', checked: s.zoomMode === 'fit-width', run: () => this.run('view.fitWidth') },
      '-',
      ...ZOOM_PRESETS.map((p) => ({ label: `${p}%`, checked: s.zoomMode === 'custom' && s.zoomPercent === p, run: () => this.run('view.zoomTo', p / 100) })),
    ]);
  }

  #themePanel(anchor) {
    const s = this.state;
    const tint = this.app.prefs.get('customTint');
    const themes = el(
      'div',
      { class: 'theme-grid' },
      THEMES.map((t) =>
        el(
          'button',
          { class: `theme-chip theme-${t.id}${t.id === s.theme ? ' active' : ''}`, onclick: () => (this.run('view.theme', t.id), this.#themePanel(anchor)) },
          [el('span', { class: 'theme-sample', text: 'Aa' }), el('span', { text: t.label })],
        ),
      ),
    );
    const color = el('input', { type: 'color', value: tint?.color ?? '#d8e8d0' });
    const brightness = el('input', { type: 'range', min: 0.5, max: 1.1, step: 0.01, value: tint?.brightness ?? 0.95 });
    const applyTint = () => this.run('view.customTint', { color: color.value, brightness: Number(brightness.value) });
    color.addEventListener('input', applyTint);
    brightness.addEventListener('input', applyTint);
    showPanel(
      anchor,
      el('div', { class: 'stack' }, [
        el('h3', { text: 'Reading theme' }),
        themes,
        el('h3', { text: 'Custom tint' }),
        el('label', { class: 'row' }, ['Colour', el('span', { class: 'spacer' }), color]),
        el('label', { class: 'row' }, ['Brightness', el('span', { class: 'spacer' }), brightness]),
        el('label', { class: 'check' }, [
          el('input', {
            type: 'checkbox',
            checked: this.app.prefs.get('animations', true),
            onchange: (e) => this.app.prefs.set('animations', e.target.checked),
          }),
          ' Page-turn animations',
        ]),
      ]),
    );
  }

  #typographyPanel(anchor) {
    const settings = this.state.reflowSettings;
    const update = (patch) => this.run('view.reflowSettings', patch);
    const range = (label, key, min, max, step, format) => {
      const value = el('span', { class: 'muted', text: format(settings[key]) });
      const input = el('input', { type: 'range', min, max, step, value: settings[key] });
      input.addEventListener('input', () => {
        value.textContent = format(Number(input.value));
        update({ [key]: Number(input.value) });
      });
      return el('label', { class: 'stack tight' }, [el('div', { class: 'row' }, [label, el('span', { class: 'spacer' }), value]), input]);
    };
    const select = (label, key, options) =>
      el('label', { class: 'row' }, [
        label,
        el('span', { class: 'spacer' }),
        el(
          'select',
          { class: 'small-select', onchange: (e) => update({ [key]: e.target.value }) },
          options.map(([value, text]) => el('option', { value, text, selected: settings[key] === value })),
        ),
      ]);
    showPanel(
      anchor,
      el('div', { class: 'stack' }, [
        el('h3', { text: 'Text settings' }),
        select(
          'Font',
          'font',
          Object.entries(REFLOW_FONTS).map(([id, f]) => [id, f.label]),
        ),
        range('Size', 'size', 12, 36, 1, (v) => `${v}px`),
        range('Line spacing', 'lineHeight', 1.1, 2.4, 0.05, (v) => v.toFixed(2)),
        range('Column width', 'width', 420, 1100, 10, (v) => `${v}px`),
        select('Alignment', 'align', [
          ['left', 'Left'],
          ['justify', 'Justified'],
        ]),
      ]),
    );
  }

  #toolPanel(anchor) {
    const s = this.state;
    const isInk = TOOLS[s.tool]?.ink;
    const width = el('input', {
      type: 'range',
      min: isInk && s.tool === 'marker' ? 4 : 0.5,
      max: s.tool === 'marker' ? 30 : 12,
      step: 0.5,
      value: s.toolWidth,
    });
    width.addEventListener('input', () => this.run('tool.width', Number(width.value)));
    showPanel(
      anchor,
      el('div', { class: 'stack' }, [
        el('h3', { text: `${TOOLS[s.tool].label} colour` }),
        el(
          'div',
          { class: 'swatches' },
          PALETTE.map((c) =>
            el('button', {
              class: `swatch${c === s.toolColor ? ' active' : ''}`,
              style: { background: c },
              onclick: () => (this.run('tool.color', c), this.#toolPanel(anchor)),
            }),
          ),
        ),
        isInk ? el('label', { class: 'stack tight' }, ['Line weight', width]) : null,
      ]),
    );
  }

  #moreMenu(anchor) {
    showMenu(anchor, [
      { label: 'Go to page…', hint: '⌘G', run: () => this.run('nav.goToPage') },
      { label: 'Toggle bookmark', hint: '⌘D', run: () => this.run('nav.toggleBookmark') },
      { label: 'Copy link to this spot', hint: '⇧⌘C', run: () => this.run('nav.copyLink') },
      '-',
      { label: 'Export notes as Markdown…', run: () => this.run('export.annotations', 'md') },
      { label: 'Export notes as JSON…', run: () => this.run('export.annotations', 'json') },
      { label: 'Export notes as text…', run: () => this.run('export.annotations', 'txt') },
      { label: 'Save flattened PDF…', hint: '⇧⌘S', run: () => this.run('export.flattened') },
      { label: 'Save searchable PDF (OCR)…', run: () => this.run('export.searchable') },
      '-',
      { label: 'Recognize text on this page (OCR)', run: () => this.run('tools.ocr', 'page') },
      { label: 'Recognize text in whole book (OCR)', run: () => this.run('tools.ocr', 'all') },
      { label: 'Recompute margin crop', run: () => this.run('tools.recomputeCrop') },
      '-',
      { label: 'Keyboard shortcuts', hint: '⌘/', run: () => this.run('help.shortcuts') },
    ]);
  }
}
