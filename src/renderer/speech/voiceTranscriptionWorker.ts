import {
  pipeline,
  env,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionOutput,
  type DeviceType,
} from "@huggingface/transformers";
import type { AudioTranscriptionModel } from "@/shared/settings";

// Avoid quantized Whisper decoder graphs here: ONNX Runtime Web can fail
// session creation on those with missing QDQ scale initializers.
const SPEECH_DTYPE = "fp32";
const TARGET_SAMPLE_RATE = 16_000;
const MAX_UNCHUNKED_AUDIO_SECONDS = 29;
const WASM_DEVICE: DeviceType = "wasm";
const WEBGPU_DEVICE: DeviceType = "webgpu";

// Models are fetched from the Hugging Face CDN, never from a local server path.
// Skipping the local-model probe avoids a spurious 404 on first load.
env.allowLocalModels = false;

type SpeechPipeline = (
  audio: Float32Array,
  options?: {
    chunk_length_s?: number;
    language?: string;
    stride_length_s?: number;
    streamer?: unknown;
    task?: string;
  },
) => Promise<AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[]>;

type SpeechPipelineOptions = NonNullable<Parameters<SpeechPipeline>[1]>;
type WhisperTokenizerForStreamer = ConstructorParameters<typeof WhisperTextStreamer>[0];
type SpeechPipelineWithTokenizer = SpeechPipeline & { tokenizer: unknown };

type VoiceTranscriptionOptions = {
  language: string;
  model: AudioTranscriptionModel;
  useWebGpu: boolean;
};

export type VoiceTranscriptionProgress = {
  language: string;
  loaded?: number;
  model: AudioTranscriptionModel;
  phase: "download" | "ready";
  progress?: number;
  total?: number;
};

export type VoiceTranscriptionRequest =
  | { type: "warmup"; options: VoiceTranscriptionOptions }
  | {
      type: "transcribe";
      id: number;
      samples: Float32Array;
      options: VoiceTranscriptionOptions;
      stream?: boolean;
    };

export type VoiceTranscriptionResponse =
  | {
      type: "progress";
      progress: VoiceTranscriptionProgress;
    }
  | {
      id: number;
      type: "partial";
      text: string;
    }
  | {
      id: number;
      type: "result";
      text: string;
    }
  | {
      id: number;
      type: "error";
      error: string;
    };

const transcriberPromises = new Map<string, Promise<SpeechPipelineWithTokenizer>>();
const disabledWebGpuModelIds = new Set<string>();

function readProgressNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function postProgress(options: VoiceTranscriptionOptions, info: unknown) {
  if (!info || typeof info !== "object" || !("status" in info)) return;
  const status = info.status;
  if (status === "ready") {
    self.postMessage({
      type: "progress",
      progress: { language: options.language, model: options.model, phase: "ready" },
    } satisfies VoiceTranscriptionResponse);
    return;
  }
  if (status !== "download" && status !== "progress_total") return;

  const progressInfo = info as { loaded?: unknown; progress?: unknown; total?: unknown };
  const loaded = readProgressNumber(progressInfo.loaded);
  const progress = readProgressNumber(progressInfo.progress);
  const total = readProgressNumber(progressInfo.total);
  self.postMessage({
    type: "progress",
    progress: {
      language: options.language,
      model: options.model,
      phase: "download",
      ...(loaded !== undefined ? { loaded } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ...(total !== undefined ? { total } : {}),
    },
  } satisfies VoiceTranscriptionResponse);
}

function getModelId(options: VoiceTranscriptionOptions): string {
  const modelSuffix = options.language === "en" ? `${options.model}.en` : options.model;
  return `Xenova/whisper-${modelSuffix}`;
}

function getTranscriberCacheKey(modelId: string, device: DeviceType): string {
  return `${modelId}:${device}`;
}

function getTranscriberForDevice(
  options: VoiceTranscriptionOptions,
  modelId: string,
  device: DeviceType,
): Promise<SpeechPipelineWithTokenizer> {
  const cacheKey = getTranscriberCacheKey(modelId, device);
  let transcriberPromise = transcriberPromises.get(cacheKey);
  if (!transcriberPromise) {
    transcriberPromise = (
      pipeline("automatic-speech-recognition", modelId, {
        device,
        dtype: SPEECH_DTYPE,
        progress_callback: (info: unknown) => postProgress(options, info),
      }) as Promise<SpeechPipelineWithTokenizer>
    ).catch((error: unknown) => {
      transcriberPromises.delete(cacheKey);
      throw error;
    });
    transcriberPromises.set(cacheKey, transcriberPromise);
  }
  return transcriberPromise;
}

function getTranscriber(options: VoiceTranscriptionOptions): Promise<SpeechPipelineWithTokenizer> {
  const modelId = getModelId(options);
  if (!options.useWebGpu || disabledWebGpuModelIds.has(modelId)) {
    return getTranscriberForDevice(options, modelId, WASM_DEVICE);
  }
  return getTranscriberForDevice(options, modelId, WEBGPU_DEVICE).catch(() => {
    disabledWebGpuModelIds.add(modelId);
    return getTranscriberForDevice(options, modelId, WASM_DEVICE);
  });
}

function getTranscriptionOptions(
  options: VoiceTranscriptionOptions,
  sampleCount: number,
): SpeechPipelineOptions {
  const pipelineOptions: SpeechPipelineOptions =
    options.language === "en"
      ? {}
      : {
          language: options.language,
          task: "transcribe",
        };

  if (sampleCount > TARGET_SAMPLE_RATE * MAX_UNCHUNKED_AUDIO_SECONDS) {
    pipelineOptions.chunk_length_s = 30;
    pipelineOptions.stride_length_s = 5;
  }

  return pipelineOptions;
}

self.onmessage = (event: MessageEvent<VoiceTranscriptionRequest>) => {
  const request = event.data;
  if (request.type === "warmup") {
    // Begin loading the model so it overlaps recording; errors are ignored here
    // and surface on the actual transcription request instead.
    void getTranscriber(request.options).catch(() => {});
    return;
  }

  const { id, samples } = request;
  void getTranscriber(request.options)
    .then((transcriber) => {
      const pipelineOptions = getTranscriptionOptions(request.options, samples.length);
      if (request.stream) {
        let partialText = "";
        pipelineOptions.streamer = new WhisperTextStreamer(
          transcriber.tokenizer as WhisperTokenizerForStreamer,
          {
            skip_prompt: true,
            callback_function: (text) => {
              partialText += text;
              const trimmed = partialText.trim();
              if (trimmed) {
                self.postMessage({
                  id,
                  type: "partial",
                  text: trimmed,
                } satisfies VoiceTranscriptionResponse);
              }
            },
          },
        );
      }
      return transcriber(samples, pipelineOptions);
    })
    .then((output) => {
      const text = Array.isArray(output) ? output.map((item) => item.text).join(" ") : output.text;
      self.postMessage({ id, type: "result", text } satisfies VoiceTranscriptionResponse);
    })
    .catch((error: unknown) => {
      self.postMessage({
        id,
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      } satisfies VoiceTranscriptionResponse);
    });
};
