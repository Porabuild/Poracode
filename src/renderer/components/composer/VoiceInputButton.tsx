import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { toast, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { formatVoiceError, showVoiceCaptureError } from "./voiceError";
import {
  prepareVoiceAudio,
  subscribeVoiceTranscriptionProgress,
} from "@/renderer/speech/voiceTranscription";
import {
  transcribeDictation,
  warmupDictation,
  type DictationOptions,
} from "@/renderer/speech/dictation";
import { HEX_VOICE_MAX_SECONDS } from "@/shared/contracts/hexVoice";
import type { VoiceTranscriptionProgress } from "@/renderer/speech/voiceTranscriptionWorker";
import { createHexVoiceSession, HexVoiceError } from "@/renderer/speech/hexVoice";
import type { HexVoiceJob } from "@/shared/contracts/hexVoice";
import { VoiceInputFeedback, type VoiceInputFailure } from "./VoiceInputFeedback";

type VoiceInputState = "idle" | "starting" | "recording" | "transcribing";

const AUTO_TRANSCRIBE_PAUSE_MS = 1400;
const AUTO_TRANSCRIBE_SPEECH_RMS = 0.01;

interface AudioCapture {
  options: DictationOptions;
  sampleCount: number;
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
  /** Renders the button disabled with this reason as the tooltip label. */
  unavailableHint?: string | undefined;
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
    const {
      isDisabled = false,
      unavailableHint,
      onTranscript,
      onTranscriptPreview,
      onTranscriptCancel,
    } = props;
    const [downloadProgress, setDownloadProgress] = useState<VoiceTranscriptionProgress | null>(
      null,
    );
    const [state, setState] = useState<VoiceInputState>("idle");
    const [failure, setFailure] = useState<VoiceInputFailure | null>(null);
    const [hexProgress, setHexProgress] = useState<HexVoiceJob | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [activeBackend, setActiveBackend] = useState<DictationOptions["backend"]>("transformers");
    const retryRef = useRef<{ samples: Float32Array; options: DictationOptions } | null>(null);
    const microphoneDeviceId = useSharedSettings((s) => s.audio.microphoneDeviceId);
    const transcriptionLanguage = useSharedSettings((s) => s.audio.transcriptionLanguage);
    const transcriptionModel = useSharedSettings((s) => s.audio.transcriptionModel);
    const transcriptionBackend = useSharedSettings((s) => s.audio.transcriptionBackend);
    const hexModel = useSharedSettings((s) => s.audio.hexModel);
    const useWebGpu = useSharedSettings((s) => s.audio.useWebGpu);
    const captureRef = useRef<AudioCapture | null>(null);
    const disposedRef = useRef(false);
    const transcriptionAbortRef = useRef<AbortController | null>(null);

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

    useEffect(() => {
      disposedRef.current = false;
      return () => {
        disposedRef.current = true;
        transcriptionAbortRef.current?.abort();
        retryRef.current = null;
        stopCapture();
      };
    }, []);

    useEffect(() => {
      if (!failure?.canRetry) return;
      const timeout = setTimeout(() => {
        retryRef.current = null;
        setFailure(null);
      }, 120_000);
      return () => clearTimeout(timeout);
    }, [failure]);

    useEffect(() => {
      if (state !== "recording") return;
      const started = performance.now();
      const timer = setInterval(
        () => setElapsed(Math.floor((performance.now() - started) / 1_000)),
        1_000,
      );
      return () => clearInterval(timer);
    }, [state]);

    useEffect(
      () =>
        subscribeVoiceTranscriptionProgress((progress) => {
          if (
            transcriptionBackend !== "transformers" ||
            progress.language !== transcriptionLanguage ||
            progress.model !== transcriptionModel
          ) {
            return;
          }
          setDownloadProgress(progress.phase === "ready" ? null : progress);
        }),
      [transcriptionBackend, transcriptionLanguage, transcriptionModel],
    );

    async function transcribeSamples(samples: Float32Array, options: DictationOptions) {
      if (samples.length === 0) {
        toast.danger(t`No speech detected.`);
        onTranscriptCancel?.();
        setState("idle");
        return;
      }

      setState("transcribing");
      setHexProgress(null);
      const abort = new AbortController();
      transcriptionAbortRef.current = abort;
      try {
        const text = (
          await transcribeDictation(samples, options, {
            signal: abort.signal,
            onPartial: (partial) => {
              if (!disposedRef.current && !abort.signal.aborted) {
                onTranscriptPreview?.(partial);
              }
            },
            onProgress: (progress) => {
              if (!disposedRef.current && !abort.signal.aborted) setHexProgress(progress);
            },
          })
        ).trim();
        if (disposedRef.current || abort.signal.aborted) return;
        if (text) {
          onTranscript(text);
        } else {
          onTranscriptCancel?.();
          toast.danger(t`No speech detected.`);
        }
      } catch (error) {
        if (!disposedRef.current && !abort.signal.aborted) {
          onTranscriptCancel?.();
          const canRetry = options.backend === "hex";
          if (canRetry) retryRef.current = { samples, options };
          setFailure({ message: formatVoiceError(error), canRetry });
        }
      } finally {
        transcriptionAbortRef.current = null;
        if (!disposedRef.current) {
          setState("idle");
        }
      }
    }

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.danger(
          window.isSecureContext === false
            ? t`Microphone access requires HTTPS or localhost. Open Poracode over a secure connection.`
            : t`Voice input is not available in this environment.`,
        );
        return;
      }

      setState("starting");
      setFailure(null);
      retryRef.current = null;
      setElapsed(0);
      setActiveBackend(transcriptionBackend);
      setDownloadProgress(null);
      onTranscriptCancel?.();
      const options: DictationOptions = {
        backend: transcriptionBackend,
        model: transcriptionModel,
        hexModel,
        language: transcriptionLanguage,
        useWebGpu,
      };
      let context: AudioContext | null = null;
      let stream: MediaStream | null = null;
      const startingAbort = new AbortController();
      transcriptionAbortRef.current = startingAbort;
      try {
        context = createAudioContext();
        if (options.backend === "hex") {
          options.hexSession = createHexVoiceSession();
          await options.hexSession.checkReady(
            options.hexModel,
            options.language,
            startingAbort.signal,
          );
          if (disposedRef.current || startingAbort.signal.aborted) {
            void context.close();
            return;
          }
        }
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
          event.outputBuffer.getChannelData(0).fill(0);
          const capture = captureRef.current;
          if (!capture || capture.autoStopping) return;
          const remaining =
            capture.options.backend === "hex"
              ? Math.floor(capture.context.sampleRate * HEX_VOICE_MAX_SECONDS) - capture.sampleCount
              : input.length;
          const chunk = new Float32Array(input.subarray(0, Math.min(input.length, remaining)));
          chunks.push(chunk);
          capture.sampleCount += chunk.length;
          if (capture.options.backend === "hex" && remaining <= input.length) {
            capture.autoStopping = true;
            stopRecording();
            return;
          }

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
          options,
          sampleCount: 0,
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
        transcriptionAbortRef.current = null;
        warmupDictation(options);
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
        transcriptionAbortRef.current = null;
        if (!disposedRef.current) {
          setState("idle");
          if (error instanceof HexVoiceError)
            setFailure({ message: error.message, canRetry: false });
          else showVoiceCaptureError(error);
        }
      }
    }

    function stopRecording() {
      const capture = stopCapture();
      if (!capture) return;
      const samples = prepareVoiceAudio(capture.chunks, capture.context.sampleRate);
      void transcribeSamples(samples, capture.options);
    }

    const isRecording = state === "recording";
    const isStarting = state === "starting";
    const isTranscribing = state === "transcribing";
    const canCancel = isTranscribing && activeBackend === "hex";
    // Mirror the Button's effective disabled state: a started/transcribing run is
    // busy, and an externally-disabled composer blocks starting (but never blocks
    // stopping an in-progress recording) — an unavailable hint follows the same
    // rule so it can never strand an in-flight recording.
    const unavailable = unavailableHint !== undefined && !isRecording && !canCancel;
    const pressDisabled =
      unavailable ||
      (isDisabled && !isRecording && !canCancel) ||
      isStarting ||
      (isTranscribing && !canCancel);

    function togglePress(): boolean {
      if (pressDisabled) return false;
      if (canCancel) {
        transcriptionAbortRef.current?.abort();
        onTranscriptCancel?.();
      } else if (isRecording) {
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
    const phaseLabel =
      hexProgress?.phase === "uploading"
        ? t`Uploading audio…`
        : hexProgress?.phase === "loading"
          ? t`Loading model…`
          : t`Transcribing voice`;
    const stateLabel =
      downloadLabel ??
      (isRecording
        ? t`Stop voice input`
        : isStarting
          ? t`Starting voice input`
          : isTranscribing
            ? canCancel
              ? t`Cancel transcription`
              : t`Transcribing voice`
            : t`Start voice input`);
    const label = unavailable && unavailableHint !== undefined ? unavailableHint : stateLabel;

    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <Tooltip delay={300}>
          <Button
            isIconOnly
            aria-label={label}
            className={`poracode-composer-menu min-w-9 px-2 ${isRecording ? "text-danger" : ""}`}
            isDisabled={pressDisabled}
            onPress={togglePress}
            size="sm"
            variant="ghost"
          >
            {canCancel ? (
              <X className="size-4" />
            ) : isStarting || isTranscribing ? (
              <PixelLoader size="xs" />
            ) : isRecording ? (
              <Square className="size-3.5 fill-current" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>
          <Tooltip.Content placement="top">
            {canCancel ? `${phaseLabel} · ${label}` : label}
          </Tooltip.Content>
        </Tooltip>
        {isRecording && (
          <span
            className={`text-[11px] tabular-nums ${activeBackend === "hex" && elapsed >= HEX_VOICE_MAX_SECONDS - 15 ? "text-danger" : "text-muted"}`}
            title={
              activeBackend === "hex"
                ? t`Recording stops automatically at five minutes.`
                : t`Recording`
            }
          >
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            {activeBackend === "hex" && elapsed >= HEX_VOICE_MAX_SECONDS - 15 && (
              <span role="status" className="sr-only">
                <Trans>Recording will stop in less than fifteen seconds.</Trans>
              </span>
            )}
          </span>
        )}
        {canCancel && (
          <span role="status" className="max-w-28 truncate text-[11px] text-muted">
            {phaseLabel}
          </span>
        )}
        {failure && (
          <VoiceInputFeedback
            failure={failure}
            isDisabled={isDisabled || state !== "idle"}
            onDiscard={() => {
              retryRef.current = null;
              setFailure(null);
            }}
            onRetry={() => {
              const retained = retryRef.current;
              if (!retained || state !== "idle" || isDisabled) return;
              retryRef.current = null;
              setFailure(null);
              void transcribeSamples(retained.samples, retained.options);
            }}
          />
        )}
      </span>
    );
  },
);
