import type { AudioTranscriptionModel } from "@/shared/settings";
import type { HexVoiceJob } from "@/shared/contracts/hexVoice";
import { createHexVoiceSession, type HexVoiceSession } from "./hexVoice";
import { transcribeVoiceAudio, warmupVoiceTranscription } from "./voiceTranscription";

export interface DictationOptions {
  backend: "transformers" | "hex";
  model: AudioTranscriptionModel;
  hexModel: string;
  language: string;
  useWebGpu: boolean;
  hexSession?: HexVoiceSession;
}

export function warmupDictation(options: DictationOptions): void {
  if (options.backend === "transformers") warmupVoiceTranscription(options);
}

export function transcribeDictation(
  samples: Float32Array,
  options: DictationOptions,
  callbacks: {
    signal: AbortSignal;
    onPartial: (text: string) => void;
    onProgress?: (job: HexVoiceJob) => void;
  },
): Promise<string> {
  if (options.backend === "hex") {
    return (options.hexSession ?? createHexVoiceSession()).transcribe(samples, {
      model: options.hexModel,
      language: options.language,
      signal: callbacks.signal,
      ...(callbacks.onProgress ? { onProgress: callbacks.onProgress } : {}),
    });
  }
  return transcribeVoiceAudio(samples, options, { onPartial: callbacks.onPartial });
}
