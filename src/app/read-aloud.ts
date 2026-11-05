/**
 * Read-aloud: speaks a book sentence by sentence, highlighting the sentence
 * being read and turning pages as it goes.
 *
 * It starts at the selected text, or at the top of what's on screen. Jumping
 * elsewhere (page number, contents, search, bookmarks, swiping) while it's
 * playing moves the reading there too: a page change that isn't our own
 * follow-along scroll, and that takes the reading position out of view,
 * counts as the reader going somewhere else.
 *
 * Engines (services/speech) speak one sentence at a time; this class owns the
 * position and the loop. Each loop run has a number, and pause/stop/jumps
 * bump it so a stale loop exits after its current await.
 */
import { Emitter } from '../lib/util.ts';
import { rectsForRange, type MeasureText, type PageText } from '../lib/page-text.ts';
import { charIndexAt, sentenceIndexAt, splitSentences, type Sentence } from '../lib/speech-text.ts';
import { selectionByPage } from '../engine/annotations/text-selection.ts';
import { SystemSpeech, isAbort, preferredVoices, type SpeakOptions, type SpeechEngine, type SpeechEngineId } from '../services/speech/engine.ts';
import { NaturalSpeech, type NaturalLoadState } from '../services/speech/natural-engine.ts';
import type { Preferences } from './preferences.ts';
import type { ReaderPane } from '../engine/reader-pane.ts';
import type { PdfRect } from '../models/types.ts';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';

export interface ReadAloudState {
  status: ReadAloudStatus;
  engine: SpeechEngineId;
  voice: string | null;
  rate: number;
  page: number;
  /** Waiting for sound: the natural voice downloading, loading or generating a sentence. */
  loading: boolean;
  /** The natural voice is chosen but not on this device yet (asks before a ~90 MB download). */
  needsDownload: boolean;
  download: NaturalLoadState;
  /** Device voices exist here (not in Android's web view, for example). */
  systemAvailable: boolean;
  /** Size of the natural voice's one-time download on this device. */
  naturalDownloadMb: number;
  /** The natural voice runs on the graphics chip here (fast); otherwise on the CPU (can be slow). */
  naturalFast: boolean;
  /** Something the reader should know that isn't an error (e.g. a voice switch). */
  notice: string | null;
  error: string | null;
}

type StartAt = { page: number; at: number | { x: number; y: number } };

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
/** Pages without readable text to skip (scans, blank pages) before giving up. */
const MAX_EMPTY_PAGES = 5;
/** Page changes this soon after our own scroll are us following along. */
const FOLLOW_GRACE_MS = 1200;
/** Show "Preparing voice…" only for waits long enough to notice. */
const WAIT_VISIBLE_MS = 300;
/** A natural-voice sentence slower than this means the device can't keep up: use device voices. */
const SLOW_NATURAL_MS = 20_000;
/** Keep the sentence this far from the bottom edge when following in scroll view. */
const FOLLOW_MARGIN_PX = 96;

/** Proportional widths (a serif face, like most books) so highlights start and end on the right letters. */
let measureContext: CanvasRenderingContext2D | null = null;
const measure: MeasureText = (str) => {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = '100px Georgia, "Times New Roman", serif';
  return measureContext.measureText(str).width;
};

export class ReadAloud extends Emitter<{ change: []; highlight: [pages: number[]] }> {
  readonly system = new SystemSpeech();
  readonly natural = new NaturalSpeech();
  status: ReadAloudStatus = 'idle';
  error: string | null = null;
  notice: string | null = null;
  needsDownload = false;
  pane: ReaderPane | null = null;
  page = 0;
  #text: PageText | null = null;
  #sentences: Sentence[] = [];
  #index = 0;
  #run = 0;
  #abort: AbortController | null = null;
  #followedAt = 0;
  /** Since when the current sentence has been waiting for sound (null once it plays). */
  #waitingSince: number | null = null;
  #waitTimers: Array<ReturnType<typeof setTimeout>> = [];
  #systemUsable: boolean;
  /** The device has a high-quality voice for the reader's language. */
  #systemNatural = false;
  #naturalStored = false;
  #naturalMb = 92;
  #naturalFast = false;
  #unsubscribePane: (() => void) | null = null;
  readonly #prefs: Preferences;

  constructor(prefs: Preferences) {
    super();
    this.#prefs = prefs;
    this.#systemUsable = this.system.available();
    // Some web views expose the API with no voices (Linux); treat that as unavailable.
    void this.system.voices().then((voices) => {
      this.#systemUsable = voices.length > 0;
      this.#systemNatural = preferredVoices(voices).some((v) => v.enhanced);
      this.emit('change');
    });
    void this.natural.backend.then(({ downloadMb, device }) => {
      this.#naturalMb = downloadMb;
      this.#naturalFast = device === 'webgpu';
      this.emit('change');
    });
    void this.natural.isDownloaded().then((stored) => {
      this.#naturalStored = stored;
      this.emit('change');
    });
    this.natural.on('load', () => {
      if (this.natural.loadState.status === 'ready') this.#naturalStored = true;
      this.emit('change');
    });
  }

  // ---- Settings -----------------------------------------------------------------

  /**
   * The chosen engine. By default: device voices when the device has a
   * high-quality one for the reader's language (instant, no download);
   * otherwise the natural voice if it runs on the graphics chip here, since
   * basic device voices sound robotic. On the CPU alone the natural voice can
   * be far slower than speech, so device voices stay the default there.
   */
  get engineId(): SpeechEngineId {
    const fallback = this.#systemNatural ? 'system' : this.#naturalFast || !this.#systemUsable ? 'natural' : 'system';
    const chosen = this.#prefs.get('speechEngine') ?? fallback;
    return chosen === 'system' && this.#systemUsable ? 'system' : 'natural';
  }

  get engine(): SpeechEngine {
    return this.engineId === 'natural' ? this.natural : this.system;
  }

  #options(): SpeakOptions {
    return { voice: this.#prefs.get('speechVoices')[this.engineId] ?? null, rate: this.#prefs.get('speechRate') };
  }

  get state(): ReadAloudState {
    const download = this.natural.loadState;
    return {
      status: this.status,
      engine: this.engineId,
      voice: this.#options().voice,
      rate: this.#prefs.get('speechRate'),
      page: this.page,
      loading:
        this.status === 'playing' &&
        ((this.#waitingSince !== null && Date.now() - this.#waitingSince >= WAIT_VISIBLE_MS) || (this.engineId === 'natural' && download.status !== 'ready')),
      needsDownload: this.needsDownload,
      download,
      systemAvailable: this.#systemUsable,
      naturalDownloadMb: this.#naturalMb,
      naturalFast: this.#naturalFast,
      notice: this.notice,
      error: this.error,
    };
  }

  /** Settings changes apply from the next sentence; the current one restarts with them. */
  #restartSentence(): void {
    if (this.status === 'playing') this.#play();
    this.emit('change');
  }

  setRate(rate: number): void {
    this.#prefs.set('speechRate', rate);
    this.#restartSentence();
  }

  setVoice(voice: string): void {
    this.#prefs.set('speechVoices', { ...this.#prefs.get('speechVoices'), [this.engineId]: voice });
    this.#restartSentence();
  }

  setEngine(engine: SpeechEngineId): void {
    this.#prefs.set('speechEngine', engine);
    this.needsDownload = engine === 'natural' && !this.#naturalStored && this.status !== 'idle';
    if (this.needsDownload) this.#pause();
    this.#restartSentence();
  }

  /** Downloads the natural voice (the reader agreed to the size), then carries on reading. */
  async download(): Promise<void> {
    this.needsDownload = false;
    this.error = null;
    this.emit('change');
    try {
      await this.natural.load();
    } catch (error) {
      this.error = `Couldn't download the natural voice: ${(error as Error).message}`;
      this.emit('change');
      return;
    }
    if (this.status === 'paused' && this.pane) this.#play();
  }

  // ---- Transport ----------------------------------------------------------------

  /** Play, pause or resume. Call from the tap itself so mobile browsers allow audio. */
  toggle(pane: ReaderPane): void {
    // Unlock both: reading can switch engines later without a tap (see #fallBackToSystem).
    this.system.unlock();
    this.natural.unlock();
    if (this.status === 'playing') this.#pause();
    else void this.start(pane);
  }

  /** Starts (or resumes) reading. Selected text, if any, is where it starts. */
  async start(pane: ReaderPane): Promise<void> {
    this.error = null;
    this.notice = null;
    if (pane !== this.pane) this.#attach(pane);
    const from = this.#selectionStart(pane) ?? (this.status === 'paused' ? null : this.#screenStart(pane));
    if (from) await this.#load(from.page, from.at);
    if (this.engineId === 'natural' && !this.#naturalStored && this.natural.loadState.status !== 'loading') {
      this.needsDownload = true;
      this.status = 'paused';
      this.#highlight();
      this.emit('change');
      return;
    }
    this.#play();
  }

  stop(): void {
    this.#cancel();
    const page = this.page;
    this.status = 'idle';
    this.needsDownload = false;
    this.notice = null;
    this.#unsubscribePane?.();
    this.#unsubscribePane = null;
    this.pane = null;
    this.emit('highlight', [page]);
    this.emit('change');
  }

  /** Moves by whole sentences, crossing pages as needed. */
  async skip(delta: number): Promise<void> {
    if (this.status === 'idle') return;
    const wasPlaying = this.status === 'playing';
    this.#cancel();
    let index = this.#index + delta;
    if (index < 0 && this.page > 1) {
      await this.#load(this.page - 1, Number.MAX_SAFE_INTEGER);
      index = this.#sentences.length - 1;
    } else if (index >= this.#sentences.length && this.pane && this.page < this.pane.book.numPages) {
      await this.#load(this.page + 1, 0);
      index = 0;
    }
    this.#index = Math.max(0, Math.min(index, this.#sentences.length - 1));
    if (wasPlaying) this.#play();
    else this.#highlight();
  }

  /** Continues reading from the start of `page` (the reader went somewhere else). */
  async jumpTo(page: number, char = 0): Promise<void> {
    if (this.status === 'idle') return;
    const wasPlaying = this.status === 'playing';
    this.#cancel();
    await this.#load(page, char);
    if (wasPlaying) this.#play();
    else this.#highlight();
  }

  #pause(): void {
    this.#cancel();
    this.status = 'paused';
    this.emit('change');
  }

  #cancel(): void {
    this.#run++;
    this.#abort?.abort();
    this.#abort = null;
    this.#stopWaiting();
  }

  /** A sentence is waiting for sound: show it after a moment, and give up on a natural voice that can't keep up. */
  #startWaiting(run: number): void {
    this.#stopWaiting();
    this.#waitingSince = Date.now();
    this.#waitTimers.push(setTimeout(() => this.emit('change'), WAIT_VISIBLE_MS));
    if (this.engineId === 'natural' && this.#systemUsable && this.natural.loadState.status === 'ready') {
      this.#waitTimers.push(setTimeout(() => run === this.#run && this.#fallBackToSystem(), SLOW_NATURAL_MS));
    }
  }

  #stopWaiting(): void {
    const wasShown = this.#waitingSince !== null && Date.now() - this.#waitingSince >= WAIT_VISIBLE_MS;
    this.#waitingSince = null;
    this.#waitTimers.forEach(clearTimeout);
    this.#waitTimers = [];
    if (wasShown) this.emit('change');
  }

  #fallBackToSystem(): void {
    this.#prefs.set('speechEngine', 'system');
    this.notice = 'The natural voice is too slow on this device, so the device voice is reading. You can switch back under Voice.';
    this.#play();
  }

  #play(): void {
    this.#cancel();
    this.status = 'playing';
    this.emit('change');
    void this.#loop(this.#run);
  }

  async #loop(run: number): Promise<void> {
    const pane = this.pane;
    if (!pane) return;
    let emptyPages = 0;
    while (run === this.#run) {
      if (this.#index >= this.#sentences.length) {
        if (this.page >= pane.book.numPages) return this.stop(); // the end of the book
        await this.#load(this.page + 1, 0);
        if (run !== this.#run) return;
        if (!this.#sentences.length && ++emptyPages > MAX_EMPTY_PAGES) {
          return this.#fail('No readable text on these pages. If it is a scan, run "Recognize text" first.');
        }
        continue;
      }
      emptyPages = 0;
      const sentence = this.#sentences[this.#index];
      this.#highlight();
      this.#follow(sentence);
      this.#prepareNext();
      this.#abort = new AbortController();
      this.#startWaiting(run);
      try {
        await this.engine.speak(sentence.text, { ...this.#options(), onStart: () => this.#stopWaiting() }, this.#abort.signal);
      } catch (error) {
        if (isAbort(error) || run !== this.#run) return;
        return this.#fail((error as Error).message);
      }
      if (run !== this.#run) return;
      this.#index++;
    }
  }

  #fail(message: string): void {
    this.#cancel();
    this.status = 'paused';
    this.error = message;
    this.emit('change');
  }

  /** Lets the engine prepare the next sentence (or the next page's first) while this one plays. */
  #prepareNext(): void {
    const next = this.#sentences[this.#index + 1];
    if (next) this.engine.prepare?.(next.text, this.#options());
  }

  // ---- Position -------------------------------------------------------------------

  /** Loads a page's sentences and moves to a character index, or the text nearest a PDF point. */
  async #load(page: number, at: number | { x: number; y: number }): Promise<void> {
    const pane = this.pane!;
    const previous = this.page;
    this.page = Math.max(1, Math.min(page, pane.book.numPages));
    this.#text = await pane.book.readableText(this.page);
    this.#sentences = splitSentences(this.#text);
    const char = typeof at === 'number' ? at : charIndexAt(this.#text, at.x, at.y);
    this.#index = sentenceIndexAt(this.#sentences, char);
    if (previous && previous !== this.page) this.emit('highlight', [previous]);
  }

  /** Start of the selected text, if the reader selected some on a page. */
  #selectionStart(pane: ReaderPane): StartAt | null {
    const [first] = selectionByPage(pane);
    if (!first?.rects.length) return null;
    const rect = first.rects[0];
    window.getSelection()?.removeAllRanges();
    // The selection's first line: its left edge, just inside its top.
    return { page: first.page, at: { x: Math.min(rect.x1, rect.x2), y: Math.max(rect.y1, rect.y2) - 1 } };
  }

  /** The top of what's on screen (scroll view), or the start of the current page. */
  #screenStart(pane: ReaderPane): StartAt {
    const { page, x, y } = pane.currentPosition();
    return { page, at: y == null ? 0 : { x: x ?? 0, y } };
  }

  // ---- Highlight and follow-along -----------------------------------------------

  #highlight(): void {
    this.emit('highlight', [this.page]);
    this.emit('change');
  }

  /** PDF rectangles of the sentence being read, for the page overlay. */
  highlightOn(page: number): PdfRect[] {
    if (this.status === 'idle' || page !== this.page || !this.#text) return [];
    const sentence = this.#sentences[this.#index];
    return sentence ? rectsForRange(this.#text, sentence.start, sentence.end, measure) : [];
  }

  #attach(pane: ReaderPane): void {
    this.#unsubscribePane?.();
    this.pane = pane;
    this.#unsubscribePane = pane.on('page', (page) => {
      if (this.status === 'idle' || Date.now() - this.#followedAt < FOLLOW_GRACE_MS) return;
      if (!this.#isOnScreen(this.page)) void this.jumpTo(page);
    });
  }

  #isOnScreen(page: number, rect?: PdfRect): boolean {
    const pane = this.pane;
    if (!pane) return false;
    if (pane.reflow.active) return pane.currentPage === page;
    const bounds = pane.scroller.getBoundingClientRect();
    return pane.viewsForPage(page).some((view) => {
      if (!view.el.isConnected) return false;
      const box = view.el.getBoundingClientRect();
      if (!rect) return box.bottom > bounds.top && box.top < bounds.bottom && box.right > bounds.left && box.left < bounds.right;
      const top = box.top + view.pdfToBoxOffset(Math.min(rect.x1, rect.x2), Math.max(rect.y1, rect.y2)).y;
      const bottom = box.top + view.pdfToBoxOffset(Math.min(rect.x1, rect.x2), Math.min(rect.y1, rect.y2)).y;
      return top >= bounds.top && bottom <= bounds.bottom - FOLLOW_MARGIN_PX;
    });
  }

  /** Brings the sentence into view if it isn't. */
  #follow(sentence: Sentence): void {
    const pane = this.pane;
    if (!pane || !this.#text) return;
    const [first] = rectsForRange(this.#text, sentence.start, sentence.end, measure);
    if (this.#isOnScreen(this.page, pane.mode === 'continuous' ? first : undefined)) return;
    this.#followedAt = Date.now();
    pane.scrollTo(first ? { page: this.page, x: Math.min(first.x1, first.x2), y: Math.max(first.y1, first.y2) + 24 } : { page: this.page });
  }
}
