import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
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

export interface VoiceInputButtonProps {
  isDisabled?: boolean;
  onTranscript: (text: string) => void;
  onTranscriptPreview?: (text: string) => void;
  onTranscriptCancel?: () => void;
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

export interface VoiceInputHandle {
  /**
   * Start recording — or stop it if already recording — mirroring a press of
   * the on-screen button. Returns false (a no-op) when the button is disabled
   * or mid-flight (starting/transcribing), so a keyboard caller can let the key
   * fall through instead of swallowing it.
   */
  toggle: () => boolean;
}

export const VoiceInputButton = forwardRef<VoiceInputHandle, VoiceInputButtonProps>(
  function VoiceInputButton(props, ref) {
    const { t } = useLingui();
    const { isDisabled = false, onTranscript, onTranscriptPreview, onTranscriptCancel } = props;
    const [downloadProgress, setDownloadProgress] = useState<VoiceTranscriptionProgress | null>(
      null,
    );
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
          if (
            progress.language !== transcriptionLanguage ||
            progress.model !== transcriptionModel
          ) {
            return;
          }
          setDownloadProgress(progress.phase === "ready" ? null : progress);
        }),
      [transcriptionLanguage, transcriptionModel],
    );

    async function transcribeSamples(samples: Float32Array) {
      if (samples.length === 0) {
        toast.danger(t`No speech detected.`);
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
          toast.danger(t`No speech detected.`);
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
        toast.danger(t`Voice input is not available in this environment.`);
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
          } else if (
            capture.heardSpeech &&
            now - capture.lastSpeechAt >= AUTO_TRANSCRIBE_PAUSE_MS
          ) {
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
    // Mirror the Button's effective disabled state: a started/transcribing run is
    // busy, and an externally-disabled composer blocks starting (but never blocks
    // stopping an in-progress recording).
    const pressDisabled = (isDisabled && !isRecording) || isStarting || isTranscribing;

    function togglePress(): boolean {
      if (pressDisabled) return false;
      if (isRecording) {
        stopRecording();
      } else {
        void startRecording();
      }
      return true;
    }

    // The dictation shortcut presses the same button. Keep a ref to the latest
    // closure rather than rebuilding the handle each render, so `toggle` always
    // sees current state and audio settings without a stale-deps footgun.
    const togglePressRef = useRef(togglePress);
    togglePressRef.current = togglePress;
    useImperativeHandle(ref, () => ({ toggle: () => togglePressRef.current() }), []);

    const downloadLabel =
      downloadProgress && isTranscribing
        ? typeof downloadProgress.progress === "number"
          ? t`Downloading voice model ${Math.round(downloadProgress.progress)}%`
          : t`Downloading voice model...`
        : null;
    const label =
      downloadLabel ??
      (isRecording
        ? t`Stop voice input`
        : isStarting
          ? t`Starting voice input`
          : isTranscribing
            ? t`Transcribing voice`
            : t`Start voice input`);

    return (
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={label}
          className={`lightcode-composer-menu min-w-9 px-2 ${isRecording ? "text-danger" : ""}`}
          isDisabled={pressDisabled}
          onPress={togglePress}
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
  },
);
