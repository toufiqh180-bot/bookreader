/**
 * Speech engines for read-aloud. Two implementations:
 *
 *   system   The device's own voices (Web Speech API): instant, no download.
 *            Good on macOS, iOS and Windows; missing in Android's web view.
 *   natural  Kokoro, a small neural voice model that runs on the device in a
 *            worker (natural-engine.ts). Works everywhere; downloads once.
 *
 * Engines speak one sentence at a time; the ReadAloud controller sequences
 * them, so pause/stop simply abort the sentence in progress.
 */
export type SpeechEngineId = 'system' | 'natural';

export interface SpeechVoice {
  id: string;
  name: string;
  /** BCP 47 tag, e.g. "en-US". */
  lang: string;
  /** Higher-quality voices (premium, enhanced, neural) are listed first. */
  enhanced: boolean;
}

export interface SpeakOptions {
  voice: string | null;
  /** 1 = normal speed. */
  rate: number;
  /** Called when sound starts (after any generating or loading). */
  onStart?: () => void;
}

export interface SpeechEngine {
  readonly id: SpeechEngineId;
  available(): boolean;
  voices(): Promise<SpeechVoice[]>;
  /** Call synchronously inside a tap/click: iOS only allows speech and audio started by a gesture. */
  unlock(): void;
  /** Resolves when the text has been spoken; rejects with an AbortError when `signal` aborts. */
  speak(text: string, options: SpeakOptions, signal: AbortSignal): Promise<void>;
  /** A hint that `text` is likely next, so it can be prepared ahead of time. */
  prepare?(text: string, options: SpeakOptions): void;
}

/** The voice used when none is chosen: the reader's language (else English), enhanced voices first. */
export function preferredVoices(voices: SpeechVoice[], language = navigator.language): SpeechVoice[] {
  const code = language.slice(0, 2);
  const matching = voices.filter((v) => v.lang.startsWith(code));
  return matching.length ? matching : voices.filter((v) => v.lang.startsWith('en'));
}

export const abortError = (): DOMException => new DOMException('Speech stopped', 'AbortError');
export const isAbort = (error: unknown): boolean => (error as Error)?.name === 'AbortError';

// ---- Device voices ------------------------------------------------------------

/** Names of the higher-quality voices: Apple Premium/Enhanced, Microsoft "Online (Natural)", neural voices. */
const ENHANCED = /premium|enhanced|natural|neural|siri|online/i;
/** macOS novelty voices: sound effects, not reading voices. */
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const VOICES_TIMEOUT_MS = 1500;

export class SystemSpeech implements SpeechEngine {
  readonly id = 'system' as const;

  available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  /** Voices load asynchronously in most browsers; wait briefly for the first list. */
  async voices(): Promise<SpeechVoice[]> {
    if (!this.available()) return [];
    let list = speechSynthesis.getVoices();
    if (!list.length) {
      list = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const done = () => resolve(speechSynthesis.getVoices());
        speechSynthesis.addEventListener('voiceschanged', done, { once: true });
        setTimeout(done, VOICES_TIMEOUT_MS);
      });
    }
    return this.#describe(list);
  }

  #describe(list: SpeechSynthesisVoice[]): SpeechVoice[] {
    return list
      .filter((v) => !NOVELTY.test(v.name))
      .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, enhanced: ENHANCED.test(v.name) }))
      .sort((a, b) => Number(b.enhanced) - Number(a.enhanced) || a.name.localeCompare(b.name));
  }

  unlock(): void {
    if (!this.available()) return;
    // An empty utterance inside the gesture lets later, asynchronous speech play on iOS.
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }

  speak(text: string, { voice, rate, onStart }: SpeakOptions, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const utterance = new SpeechSynthesisUtterance(text);
      const all = speechSynthesis.getVoices();
      const fallback = preferredVoices(this.#describe(all))[0]?.id;
      const chosen = all.find((v) => v.voiceURI === (voice ?? fallback));
      if (chosen) {
        utterance.voice = chosen;
        utterance.lang = chosen.lang;
      }
      utterance.rate = rate;
      let settled = false;
      const finish = (error?: DOMException | Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        speechSynthesis.cancel();
        finish(abortError());
      };
      utterance.onstart = () => onStart?.();
      utterance.onend = () => finish();
      utterance.onerror = (event) =>
        finish(event.error === 'interrupted' || event.error === 'canceled' ? abortError() : new Error(`Speech failed: ${event.error}`));
      signal.addEventListener('abort', onAbort, { once: true });
      // Chrome can leave the queue stuck after a cancel; clearing it first keeps playback reliable.
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    });
  }
}
