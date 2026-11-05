/**
 * Runs the Kokoro text-to-speech model off the main thread.
 *
 * The model (90–330 MB, see pickNaturalBackend) and voice files come from Hugging Face the first time
 * and are kept in IndexedDB, so later sessions work offline. Cache Storage
 * isn't used because it's missing in some app web views.
 *
 * Messages in:  { type: 'load', assetsBase }  |  { type: 'generate', id, text, voice, speed }
 * Messages out: { type: 'progress', loaded, total }  |  { type: 'ready' }
 *               { type: 'audio', id, samples, sampleRate }  |  { type: 'error', id?, message }
 */
/// <reference lib="webworker" />
import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { createStore, get, set } from 'idb-keyval';
import { NATURAL_MODEL, VOICE_STORE, pickNaturalBackend } from './natural-voice-config.ts';

declare const self: DedicatedWorkerGlobalScope;

const store = createStore(VOICE_STORE.db, VOICE_STORE.table);
const networkFetch = self.fetch.bind(self);
/** Bytes downloaded per file, for one combined progress figure. */
const progress = new Map<string, { loaded: number; total: number }>();

function reportProgress(): void {
  let loaded = 0;
  let total = 0;
  for (const p of progress.values()) {
    loaded += p.loaded;
    total += p.total;
  }
  self.postMessage({ type: 'progress', loaded, total });
}

/** fetch() for Hugging Face files, answered from IndexedDB once downloaded. */
self.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://huggingface.co/')) return networkFetch(input, init);
  const cached = await get<Blob>(url, store).catch(() => undefined);
  if (cached) return new Response(cached, { headers: { 'content-length': String(cached.size) } });

  const response = await networkFetch(input, init);
  if (!response.ok || !response.body) return response;
  const total = Number(response.headers.get('content-length')) || 0;
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  const entry = { loaded: 0, total };
  progress.set(url, entry);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    entry.loaded += value.byteLength;
    if (!total) entry.total = entry.loaded;
    reportProgress();
  }
  const blob = new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? 'application/octet-stream' });
  await set(url, blob, store).catch(() => undefined); // still usable this session if storage is full
  return new Response(blob, { headers: { 'content-length': String(blob.size) } });
};

let tts: Promise<KokoroTTS> | null = null;
/** ONNX sessions aren't re-entrant: generate one sentence at a time. */
let queue: Promise<unknown> = Promise.resolve();

async function load(assetsBase: string): Promise<KokoroTTS> {
  env.allowLocalModels = false;
  env.useBrowserCache = false; // our fetch() above caches instead
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = new URL('vendor/ort/', assetsBase).href;
  // Threads need cross-origin isolation, which the app shells don't provide.
  wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const backend = await pickNaturalBackend();
  try {
    return await KokoroTTS.from_pretrained(NATURAL_MODEL, { dtype: backend.dtype, device: backend.device });
  } catch (error) {
    if (backend.device === 'wasm') throw error;
    // A GPU that announced support but failed to run the model: use the CPU.
    return KokoroTTS.from_pretrained(NATURAL_MODEL, { dtype: 'q8', device: 'wasm' });
  }
}

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'load') {
    tts ??= load(message.assetsBase);
    tts.then(
      () => self.postMessage({ type: 'ready' }),
      (error) => {
        tts = null;
        self.postMessage({ type: 'error', message: String(error?.message ?? error) });
      },
    );
    return;
  }
  if (message.type === 'generate') {
    const { id, text, voice, speed } = message;
    queue = queue.then(async () => {
      try {
        const model = await tts!;
        const audio = await model.generate(text, { voice, speed });
        const samples = audio.audio as Float32Array;
        self.postMessage({ type: 'audio', id, samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
      } catch (error) {
        self.postMessage({ type: 'error', id, message: String((error as Error)?.message ?? error) });
      }
    });
  }
};
