/** Renderer entry point: load preferences, then start the app. */
import { App } from './app/app.js';
import { Preferences } from './app/preferences.js';

const prefs = await Preferences.load();
document.body.classList.toggle('platform-mac', navigator.platform.toLowerCase().includes('mac'));
window.bookReader = new App(prefs); // exposed for debugging in DevTools
