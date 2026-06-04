import { startTransition, useEffect, useRef, useState } from "react";
import { Switch, toast } from "@heroui/react";
import { Button, Select } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { friendlyError } from "@/shared/messages";
import type { AudioTranscriptionModel } from "@/shared/settings";
import { SettingsPage } from "./SettingsForm";

const SYSTEM_MICROPHONE_ID = "system-default";

const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt", label: "Portuguese" },
  { id: "nl", label: "Dutch" },
  { id: "pl", label: "Polish" },
  { id: "ru", label: "Russian" },
  { id: "uk", label: "Ukrainian" },
  { id: "tr", label: "Turkish" },
  { id: "ar", label: "Arabic" },
  { id: "zh", label: "Chinese" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "hi", label: "Hindi" },
  { id: "vi", label: "Vietnamese" },
] as const;

const modelOptions = [
  { id: "tiny", label: "Fastest (Whisper tiny)" },
  { id: "base", label: "Better (Whisper base)" },
] as const;

interface MicrophoneTest {
  analyser: AnalyserNode;
  context: AudioContext;
  frame: number;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

function createAudioContext(): AudioContext {
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Audio input requires audio support.");
  }
  return new AudioContextCtor();
}

function buildMicrophoneOptions(devices: MediaDeviceInfo[]) {
  const microphones = devices.filter((device) => device.kind === "audioinput");
  return [
    { id: SYSTEM_MICROPHONE_ID, label: "System default" },
    ...microphones.map((device, index) => ({
      id: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    })),
  ];
}

export function AudioSettings() {
  const [microphoneOptions, setMicrophoneOptions] = useState([
    { id: SYSTEM_MICROPHONE_ID, label: "System default" },
  ]);
  const microphoneDeviceId = useSharedSettings((s) => s.audio.microphoneDeviceId);
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton);
  const transcriptionLanguage = useSharedSettings((s) => s.audio.transcriptionLanguage);
  const transcriptionModel = useSharedSettings((s) => s.audio.transcriptionModel);
  const useWebGpu = useSharedSettings((s) => s.audio.useWebGpu);
  const setAudioSetting = useSharedSettings((s) => s.setAudioSetting);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    let disposed = false;
    const refresh = () => {
      void mediaDevices.enumerateDevices().then((devices) => {
        if (!disposed) {
          setMicrophoneOptions(buildMicrophoneOptions(devices));
        }
      });
    };

    refresh();
    mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      disposed = true;
      mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, []);

  return (
    <SettingsPage title="Audio" bodyClassName="space-y-5">
      <SettingRow
        title="Show voice input button"
        description="Show the microphone button in the composer."
      >
        <Switch
          isSelected={showVoiceInputButton}
          onChange={(selected) => {
            startTransition(() => {
              setAudioSetting("showVoiceInputButton", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
      <SettingRow title="Microphone" description="Device used by the composer voice input button.">
        <Select
          aria-label="Microphone"
          className="w-[280px] shrink-0"
          options={microphoneOptions}
          value={microphoneDeviceId || SYSTEM_MICROPHONE_ID}
          onChange={(value) => {
            startTransition(() => {
              setAudioSetting("microphoneDeviceId", value === SYSTEM_MICROPHONE_ID ? "" : value);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Test microphone"
        description="Check the live input level from the selected device."
      >
        <MicrophoneTestBar microphoneDeviceId={microphoneDeviceId} />
      </SettingRow>
      <SettingRow
        title="Voice input language"
        description="Language the speech model should expect when transcribing composer dictation."
      >
        <Select
          aria-label="Voice input language"
          className="w-[280px] shrink-0"
          options={languageOptions}
          value={transcriptionLanguage}
          onChange={(value) => {
            startTransition(() => {
              setAudioSetting("transcriptionLanguage", value);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Voice input model"
        description="Fastest uses Whisper tiny; Better uses Whisper base."
      >
        <Select
          aria-label="Voice input model"
          className="w-[280px] shrink-0"
          options={modelOptions}
          value={transcriptionModel}
          onChange={(value) => {
            startTransition(() => {
              setAudioSetting("transcriptionModel", value as AudioTranscriptionModel);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Use WebGPU acceleration"
        description="Run local transcription on the GPU when available."
      >
        <Switch
          isSelected={useWebGpu}
          onChange={(selected) => {
            startTransition(() => {
              setAudioSetting("useWebGpu", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
    </SettingsPage>
  );
}

function MicrophoneTestBar(props: { microphoneDeviceId: string }) {
  const { microphoneDeviceId } = props;
  const [isStarting, setIsStarting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const testRef = useRef<MicrophoneTest | null>(null);

  function stopTest() {
    const test = testRef.current;
    if (!test) return;
    testRef.current = null;
    cancelAnimationFrame(test.frame);
    test.source.disconnect();
    test.stream.getTracks().forEach((track) => track.stop());
    void test.context.close();
    setIsTesting(false);
    setLevel(0);
  }

  useEffect(() => () => stopTest(), [microphoneDeviceId]);

  async function startTest() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.danger("Microphone testing is not available in this environment.");
      return;
    }

    setIsStarting(true);
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
      if (context.state === "suspended") {
        await context.resume();
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sumSquares = 0;
        for (const sample of data) {
          sumSquares += sample * sample;
        }
        setLevel(Math.min(1, Math.sqrt(sumSquares / data.length) * 8));
        const current = testRef.current;
        if (current) {
          current.frame = requestAnimationFrame(tick);
        }
      };

      testRef.current = { analyser, context, frame: requestAnimationFrame(tick), source, stream };
      setIsTesting(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      toast.danger(friendlyError(error));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="flex w-[280px] shrink-0 items-center gap-3">
      <Button
        className="min-w-[5rem]"
        isDisabled={isStarting}
        onPress={() => {
          if (isTesting) {
            stopTest();
          } else {
            void startTest();
          }
        }}
        size="sm"
        variant={isTesting ? "danger" : "secondary"}
      >
        {isTesting ? "Stop" : isStarting ? "Starting" : "Start"}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>Input level</span>
          <span className="tabular-nums">{isTesting ? `${Math.round(level * 100)}%` : "Idle"}</span>
        </div>
        <div
          aria-label="Microphone input level"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(level * 100)}
          className="h-2.5 overflow-hidden rounded-full bg-surface-tertiary"
          role="meter"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${isTesting ? "bg-success" : "bg-muted/35"}`}
            style={{ width: `${Math.max(isTesting ? 3 : 0, Math.round(level * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SettingRow(props: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs text-muted">{props.description}</p>
      </div>
      {props.children}
    </div>
  );
}
