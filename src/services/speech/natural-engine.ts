/**
 * The natural voice: Kokoro running in a worker (natural-voice.worker.ts),
 * played through Web Audio. While one sentence plays, the next is generated
 * (`prepare`), so there's no pause between sentences on most devices.
 */
import { createStore, get } from 'idb-keyval';
import { Emitter } from '../../lib/util.ts';
import { abortError, type SpeakOptions, type SpeechEngine, type SpeechVoice } from './engine.ts';
import { NATURAL_VOICES, VOICE_STORE, pickNaturalBackend, type NaturalBackend } from './natural-voice-config.ts';

interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

const AUDIO_RESUME_MS = 1500;
/** Prepared clips kept at once (current + upcoming). */
const MAX_PREPARED = 4;
const DEFAULT_VOICE = NATURAL_VOICES[0].id;

export type NaturalLoadState = { status: 'idle' | 'ready' } | { status: 'loading'; loaded: number; total: number } | { status: 'error'; message: string };

export class NaturalSpeech extends Emitter<{ load: [] }> implements SpeechEngine {
  readonly id = 'natural' as const;
  loadState: NaturalLoadState = { status: 'idle' };
  /** GPU or CPU, which decides the download size; the worker picks the same. */
  readonly backend: Promise<NaturalBackend> = pickNaturalBackend();
  #worker: Worker | null = null;
  #ready: Promise<void> | null = null;
  #context: AudioContext | null = null;
  #nextId = 0;
  readonly #pending = new Map<number, { resolve: (clip: Clip) => void; reject: (error: Error) => void }>();
  /** Generated or in-flight clips by text+voice+speed. */
  readonly #clips = new Map<string, Promise<Clip>>();

  available(): boolean {
    return typeof WebAssembly === 'object' && typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  /** True once the model is stored on this device (no download needed). */
  async isDownloaded(): Promise<boolean> {
    const store = createStore(VOICE_STORE.db, VOICE_STORE.table);
    const { file } = await this.backend;
    return Boolean(await get(file, store).catch(() => undefined));
  }

  async voices(): Promise<SpeechVoice[]> {
    return NATURAL_VOICES.map((v) => ({ id: v.id, name: `${v.name} (${v.note})`, lang: v.lang, enhanced: true }));
  }

  unlock(): void {
    this.#context ??= new AudioContext();
    void this.#context.resume();
  }

  /** Starts the worker and loads the model, downloading it the first time. */
  load(): Promise<void> {
    if (this.#ready) return this.#ready;
    this.#worker = new Worker(new URL('./natural-voice.worker.ts', import.meta.url), { type: 'module' });
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#worker!.onmessage = (event: MessageEvent) => {
        const message = event.data;
        // After the model is ready, only small voice files download (on first use of a voice): stay ready.
        if (message.type === 'progress') {
          if (this.loadState.status !== 'ready') this.#setLoad({ status: 'loading', loaded: message.loaded, total: message.total });
        } else if (message.type === 'ready') {
          this.#setLoad({ status: 'ready' });
          resolve();
        } else if (message.type === 'audio') {
          this.#pending.get(message.id)?.resolve({ samples: message.samples, sampleRate: message.sampleRate });
          this.#pending.delete(message.id);
        } else if (message.type === 'error') {
          if (message.id === undefined) {
            this.#setLoad({ status: 'error', message: message.message });
            this.#ready = null;
            this.#worker?.terminate();
            this.#worker = null;
            reject(new Error(message.message));
          } else {
            this.#pending.get(message.id)?.reject(new Error(message.message));
            this.#pending.delete(message.id);
          }
        }
      };
    });
    this.#setLoad({ status: 'loading', loaded: 0, total: 0 });
    this.#worker.postMessage({ type: 'load', assetsBase: document.baseURI });
    return this.#ready;
  }

  #setLoad(state: NaturalLoadState): void {
    this.loadState = state;
    this.emit('load');
  }

  #clip(text: string, { voice, rate }: SpeakOptions): Promise<Clip> {
    const key = `${voice ?? DEFAULT_VOICE}|${rate}|${text}`;
    let clip = this.#clips.get(key);
    if (!clip) {
      clip = this.load().then(
        () =>
          new Promise<Clip>((resolve, reject) => {
            const id = this.#nextId++;
            this.#pending.set(id, { resolve, reject });
            this.#worker!.postMessage({ type: 'generate', id, text, voice: voice ?? DEFAULT_VOICE, speed: rate });
          }),
      );
      clip.catch(() => this.#clips.delete(key));
      this.#clips.set(key, clip);
      // Forget the oldest clips; Map keeps insertion order.
      while (this.#clips.size > MAX_PREPARED) this.#clips.delete(this.#clips.keys().next().value!);
    }
    return clip;
  }

  prepare(text: string, options: SpeakOptions): void {
    void this.#clip(text, options).catch(() => undefined);
  }

  async speak(text: string, options: SpeakOptions, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw abortError();
    const clip = await this.#clip(text, options);
    if (signal.aborted) throw abortError();
    this.unlock();
    const context = this.#context!;
    // A context created outside a tap can stay suspended on iOS: playing into it would never end.
    if (context.state !== 'running') await Promise.race([context.resume(), new Promise((r) => setTimeout(r, AUDIO_RESUME_MS))]);
    if (context.state !== 'running') throw new Error('Audio is paused by the system. Tap play to continue.');
    const buffer = context.createBuffer(1, clip.samples.length, clip.sampleRate);
    buffer.copyToChannel(clip.samples as Float32Array<ArrayBuffer>, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        source.onended = null;
        source.stop();
        reject(abortError());
      };
      source.onended = () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      source.start();
      options.onStart?.();
    });
  }
}
