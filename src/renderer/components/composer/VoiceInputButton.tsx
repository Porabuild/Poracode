import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast, Tooltip } from "@heroui/react";
import { Button, PixelLoader } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { formatVoiceError, showVoiceCaptureError } from "./voiceError";
import {
  prepareVoiceAudio,
  subscribeVoiceTranscriptionProgress,
  transcribeVoiceAudio,
  warmupVoiceTranscription,
} from "@/renderer/speech/voiceTranscription";
import type { VoiceTranscriptionProgress } from "@/renderer/speech/voiceTranscriptionWorker";

type VoiceInputState = "idle" | "starting" | "recording" | "transcribing";

const AUTO_TRANSCRIBE_PAUSE_MS = 1400;
const AUTO_TRANSCRIBE_SPEECH_RMS = 0.01;

interface AudioCapture {
  autoStopping: boolean;
  context: AudioContext;
  chunks: Float32Array[];
  heardSpeech: boolean;
  lastSpeechAt: number;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

function createAudioContext(): AudioContext {
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Voice input requires audio support.");
  }
  return new AudioContextCtor();
}

function formatDownloadProgress(progress: VoiceTranscriptionProgress): string {
  if (typeof progress.progress === "number") {
    return `Downloading voice model ${Math.round(progress.progress)}%`;
  }
  return "Downloading voice model...";
}

export function VoiceInputButton(props: {
  isDisabled?: boolean;
  onTranscript: (text: string) => void;
  onTranscriptPreview?: (text: string) => void;
  onTranscriptCancel?: () => void;
}) {
  const { isDisabled = false, onTranscript, onTranscriptPreview, onTranscriptCancel } = props;
  const [downloadProgress, setDownloadProgress] = useState<VoiceTranscriptionProgress | null>(null);
  const [state, setState] = useState<VoiceInputState>("idle");
  const microphoneDeviceId = useSharedSettings((s) => s.audio.microphoneDeviceId);
  const transcriptionLanguage = useSharedSettings((s) => s.audio.transcriptionLanguage);
  const transcriptionModel = useSharedSettings((s) => s.audio.transcriptionModel);
  const useWebGpu = useSharedSettings((s) => s.audio.useWebGpu);
  const captureRef = useRef<AudioCapture | null>(null);
  const disposedRef = useRef(false);

  function stopCapture(): AudioCapture | null {
    const capture = captureRef.current;
    if (!capture) return null;
    captureRef.current = null;
    capture.processor.onaudioprocess = null;
    capture.processor.disconnect();
    capture.source.disconnect();
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.context.close();
    return capture;
  }

  useEffect(
    () => () => {
      disposedRef.current = true;
      stopCapture();
    },
    [],
  );

  useEffect(
    () =>
      subscribeVoiceTranscriptionProgress((progress) => {
        if (progress.language !== transcriptionLanguage || progress.model !== transcriptionModel) {
          return;
        }
        setDownloadProgress(progress.phase === "ready" ? null : progress);
      }),
    [transcriptionLanguage, transcriptionModel],
  );

  async function transcribeSamples(samples: Float32Array) {
    if (samples.length === 0) {
      toast.danger("No speech detected.");
      onTranscriptCancel?.();
      setState("idle");
      return;
    }

    setState("transcribing");
    try {
      const text = (
        await transcribeVoiceAudio(
          samples,
          {
            language: transcriptionLanguage,
            model: transcriptionModel,
            useWebGpu,
          },
          {
            onPartial: (partial) => {
              if (!disposedRef.current) {
                onTranscriptPreview?.(partial);
              }
            },
          },
        )
      ).trim();
      if (disposedRef.current) return;
      if (text) {
        onTranscript(text);
      } else {
        onTranscriptCancel?.();
        toast.danger("No speech detected.");
      }
    } catch (error) {
      if (!disposedRef.current) {
        onTranscriptCancel?.();
        toast.danger(formatVoiceError(error));
      }
    } finally {
      if (!disposedRef.current) {
        setState("idle");
      }
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.danger("Voice input is not available in this environment.");
      return;
    }

    setState("starting");
    setDownloadProgress(null);
    onTranscriptCancel?.();
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      context = createAudioContext();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
        },
      });
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        return;
      }
      if (context.state === "suspended") {
        await context.resume();
      }

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        event.outputBuffer.getChannelData(0).fill(0);
        const capture = captureRef.current;
        if (!capture || capture.autoStopping) return;

        let sumSquares = 0;
        for (const sample of input) {
          sumSquares += sample * sample;
        }

        const now = performance.now();
        if (Math.sqrt(sumSquares / input.length) >= AUTO_TRANSCRIBE_SPEECH_RMS) {
          capture.heardSpeech = true;
          capture.lastSpeechAt = now;
        } else if (capture.heardSpeech && now - capture.lastSpeechAt >= AUTO_TRANSCRIBE_PAUSE_MS) {
          capture.autoStopping = true;
          stopRecording();
        }
      };
      source.connect(processor);
      processor.connect(context.destination);
      captureRef.current = {
        autoStopping: false,
        context,
        chunks,
        heardSpeech: false,
        lastSpeechAt: performance.now(),
        processor,
        source,
        stream,
      };
      setState("recording");
      warmupVoiceTranscription({
        language: transcriptionLanguage,
        model: transcriptionModel,
        useWebGpu,
      });
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      setState("idle");
      showVoiceCaptureError(error);
    }
  }

  function stopRecording() {
    const capture = stopCapture();
    if (!capture) return;
    const samples = prepareVoiceAudio(capture.chunks, capture.context.sampleRate);
    void transcribeSamples(samples);
  }

  const isRecording = state === "recording";
  const isStarting = state === "starting";
  const isTranscribing = state === "transcribing";
  const downloadLabel =
    downloadProgress && isTranscribing ? formatDownloadProgress(downloadProgress) : null;
  const label =
    downloadLabel ??
    (isRecording
      ? "Stop voice input"
      : isStarting
        ? "Starting voice input"
        : isTranscribing
          ? "Transcribing voice"
          : "Start voice input");

  return (
    <Tooltip delay={300}>
      <Button
        isIconOnly
        aria-label={label}
        className={`lightcode-composer-menu min-w-9 px-2 ${isRecording ? "text-danger" : ""}`}
        isDisabled={(isDisabled && !isRecording) || isStarting || isTranscribing}
        onPress={() => {
          if (isRecording) {
            stopRecording();
          } else {
            void startRecording();
          }
        }}
        size="sm"
        variant="ghost"
      >
        {isStarting || isTranscribing ? (
          <PixelLoader size="xs" />
        ) : isRecording ? (
          <Square className="size-3.5 fill-current" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
      <Tooltip.Content placement="top">{label}</Tooltip.Content>
    </Tooltip>
  );
}
