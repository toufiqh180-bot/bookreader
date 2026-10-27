/**
 * App-wide preferences (not per book), persisted to preferences.json in the
 * user-data folder. Writes are debounced.
 *
 * Known keys:
 *   theme             default reading theme for new books
 *   customTint        { color, brightness } for the custom theme
 *   reflow            reflow typography settings
 *   autoScrollSpeed   px/second
 *   toolColors        { [tool]: color }
 *   toolWidths        { [tool]: width }
 *   sidebarOpen, sidebarPanel, sidebarWidth
 *   animations        page-turn animations on/off
 */
import { debounce } from '../lib/util.js';

export class Preferences {
  static async load() {
    return new Preferences((await window.api.loadPrefs()) ?? {});
  }

  constructor(values) {
    this.values = values;
    this.persist = debounce(() => window.api.savePrefs(this.values), 400);
  }

  get(key, fallback = undefined) {
    return this.values[key] ?? fallback;
  }

  set(key, value) {
    this.values[key] = value;
    this.persist();
  }
}
