/** Shared by the natural-voice engine and its worker. */
export const NATURAL_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Where the downloaded model and voices are kept. */
export const VOICE_STORE = { db: 'bookreader-voices', table: 'files' };

export interface NaturalBackend {
  device: 'webgpu' | 'wasm';
  dtype: 'fp32' | 'q8';
  /** The model file; once it's stored, the voice works offline. */
  file: string;
  downloadMb: number;
}

/**
 * With a graphics chip (WebGPU), the full-precision model: about 3× faster
 * than real time on a laptop, and the most natural sound. (16-bit weights
 * are faster still but audibly garble the voice.) Without one, 8-bit weights
 * on the CPU: a smaller download, but slower. Works in the page and workers.
 */
export async function pickNaturalBackend(): Promise<NaturalBackend> {
  const file = (name: string) => `https://huggingface.co/${NATURAL_MODEL}/resolve/main/onnx/${name}`;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<object | null> } }).gpu;
    if (await gpu?.requestAdapter()) return { device: 'webgpu', dtype: 'fp32', file: file('model.onnx'), downloadMb: 326 };
  } catch {
    // No usable GPU: fall through to the CPU.
  }
  return { device: 'wasm', dtype: 'q8', file: file('model_quantized.onnx'), downloadMb: 92 };
}

/** Kokoro's best-rated English voices. */
export const NATURAL_VOICES = [
  { id: 'af_heart', name: 'Heart', lang: 'en-US', note: 'US, warm' },
  { id: 'af_bella', name: 'Bella', lang: 'en-US', note: 'US, bright' },
  { id: 'af_nicole', name: 'Nicole', lang: 'en-US', note: 'US, soft' },
  { id: 'am_michael', name: 'Michael', lang: 'en-US', note: 'US, male' },
  { id: 'am_fenrir', name: 'Fenrir', lang: 'en-US', note: 'US, male, deep' },
  { id: 'bf_emma', name: 'Emma', lang: 'en-GB', note: 'UK' },
  { id: 'bm_george', name: 'George', lang: 'en-GB', note: 'UK, male' },
  { id: 'bm_fable', name: 'Fable', lang: 'en-GB', note: 'UK, male' },
] as const;
