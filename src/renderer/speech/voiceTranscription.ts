import type {
  VoiceTranscriptionProgress,
  VoiceTranscriptionRequest,
  VoiceTranscriptionResponse,
} from "./voiceTranscriptionWorker";
import type { AudioTranscriptionModel } from "@/shared/settings";

const TARGET_SAMPLE_RATE = 16_000;
const MIN_AUDIO_SECONDS = 0.25;
const MIN_PEAK = 0.01;
const MIN_RMS = 0.001;
const SILENCE_FRAME_RMS = 0.003;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  {
    onPartial?: (text: string) => void;
    resolve: (text: string) => void;
    reject: (error: Error) => void;
  }
>();
const progressListeners = new Set<(progress: VoiceTranscriptionProgress) => void>();

export interface VoiceTranscriptionOptions {
  language: string;
  model: AudioTranscriptionModel;
  useWebGpu: boolean;
}

function getWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("Voice input requires worker support.");
  }
  if (!worker) {
    worker = new Worker(new URL("./voiceTranscriptionWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<VoiceTranscriptionResponse>) => {
      if (event.data.type === "progress") {
        for (const listener of progressListeners) {
          listener(event.data.progress);
        }
        return;
      }
      const entry = pending.get(event.data.id);
      if (!entry) return;
      if (event.data.type === "partial") {
        entry.onPartial?.(event.data.text);
        return;
      }
      pending.delete(event.data.id);
      if (event.data.type === "result") {
        entry.resolve(event.data.text);
      } else {
        entry.reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Voice transcription worker failed.");
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export function subscribeVoiceTranscriptionProgress(
  listener: (progress: VoiceTranscriptionProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/**
 * Eagerly spin up the worker and start loading the speech model. Called when
 * recording begins so the model init (and, on first ever use, the download)
 * overlaps the seconds the user spends speaking. Safe to call repeatedly and a
 * no-op where workers are unavailable.
 */
export function warmupVoiceTranscription(options: VoiceTranscriptionOptions): void {
  try {
    getWorker().postMessage({ type: "warmup", options } satisfies VoiceTranscriptionRequest);
  } catch {
    // Worker unsupported; the real error surfaces on transcribeVoiceAudio.
  }
}

export function transcribeVoiceAudio(
  samples: Float32Array,
  options: VoiceTranscriptionOptions,
  callbacks?: { onPartial?: (text: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      resolve,
      reject,
      ...(callbacks?.onPartial ? { onPartial: callbacks.onPartial } : {}),
    });
    try {
      getWorker().postMessage(
        {
          type: "transcribe",
          id,
          samples,
          options,
          ...(callbacks?.onPartial ? { stream: true } : {}),
        } satisfies VoiceTranscriptionRequest,
        [samples.buffer as ArrayBuffer],
      );
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function prepareVoiceAudio(chunks: Float32Array[], inputSampleRate: number): Float32Array {
  const merged = mergeAudioChunks(chunks);
  const trimmed = trimSilence(merged, inputSampleRate);
  if (!hasEnoughSignal(trimmed, inputSampleRate)) return new Float32Array();
  return inputSampleRate === TARGET_SAMPLE_RATE
    ? trimmed
    : resampleLinear(trimmed, inputSampleRate, TARGET_SAMPLE_RATE);
}

function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }

  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function hasEnoughSignal(input: Float32Array, sampleRate: number): boolean {
  if (input.length < sampleRate * MIN_AUDIO_SECONDS) return false;

  let peak = 0;
  let sumSquares = 0;
  for (const sample of input) {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / input.length);
  return peak >= MIN_PEAK && rms >= MIN_RMS;
}

function trimSilence(input: Float32Array, sampleRate: number): Float32Array {
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  let firstFrame = -1;
  let lastFrame = -1;

  for (let frameStart = 0; frameStart < input.length; frameStart += frameSize) {
    const frameEnd = Math.min(input.length, frameStart + frameSize);
    let sumSquares = 0;
    for (let i = frameStart; i < frameEnd; i++) {
      const sample = input[i] ?? 0;
      sumSquares += sample * sample;
    }

    if (Math.sqrt(sumSquares / (frameEnd - frameStart)) >= SILENCE_FRAME_RMS) {
      if (firstFrame < 0) firstFrame = frameStart;
      lastFrame = frameEnd;
    }
  }

  if (firstFrame < 0) return new Float32Array();

  const padding = Math.round(sampleRate * 0.15);
  return input.slice(
    Math.max(0, firstFrame - padding),
    Math.min(input.length, lastFrame + padding),
  );
}

function resampleLinear(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < output.length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    const current = input[index] ?? 0;
    const next = input[nextIndex] ?? current;
    output[i] = current + (next - current) * fraction;
  }

  return output;
}
