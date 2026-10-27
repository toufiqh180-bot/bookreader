/**
 * App-wide settings (not per book), persisted through the platform. Writes
 * are debounced. Emits `change` after every update.
 */
import { Emitter, debounce } from '../lib/util.ts';
import { DEFAULT_REFLOW_SETTINGS, type ReflowSettings } from '../engine/reflow-view.ts';
import type { PageTransition } from '../engine/layouts/page-turn.ts';
import type { Platform } from '../platform/platform.ts';

export interface PreferenceValues {
  /** Reading theme for books opened for the first time. */
  theme: string;
  customTint: { color: string; brightness: number };
  reflow: ReflowSettings;
  autoScrollSpeed: number;
  pageTransition: PageTransition;
  toolColors: Record<string, string>;
  toolWidths: Record<string, number>;
  sidebarOpen: boolean;
  sidebarPanel: string;
  sidebarWidth: number;
}

export const DEFAULT_PREFERENCES: PreferenceValues = {
  theme: 'light',
  customTint: { color: '#d8e8d0', brightness: 0.95 },
  reflow: DEFAULT_REFLOW_SETTINGS,
  autoScrollSpeed: 60,
  pageTransition: 'curl',
  toolColors: {},
  toolWidths: {},
  sidebarOpen: false,
  sidebarPanel: 'outline',
  sidebarWidth: 320,
};

export class Preferences extends Emitter<{ change: [] }> {
  #values: PreferenceValues;
  readonly #persist: () => void;

  static async load(platform: Platform): Promise<Preferences> {
    return new Preferences(platform, (await platform.loadPreferences()) as Partial<PreferenceValues>);
  }

  private constructor(platform: Platform, stored: Partial<PreferenceValues>) {
    super();
    this.#values = { ...DEFAULT_PREFERENCES, ...stored, reflow: { ...DEFAULT_REFLOW_SETTINGS, ...stored.reflow } };
    this.#persist = debounce(() => void platform.savePreferences(this.#values as unknown as Record<string, unknown>), 400);
  }

  get<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
    return this.#values[key];
  }

  set<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void {
    this.#values = { ...this.#values, [key]: value };
    this.#persist();
    this.emit('change');
  }
}
