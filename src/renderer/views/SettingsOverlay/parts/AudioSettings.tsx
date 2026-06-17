import { startTransition, useEffect, useRef, useState } from "react";
import { Switch, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { I18n } from "@lingui/core";
import { Button, Select } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { friendlyError } from "@/shared/messages";
import type { AudioTranscriptionModel } from "@/shared/settings";
import { SettingsPage } from "./SettingsForm";
import { useLocalizedOptions } from "./settingsOptions";

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
  { id: "tiny", label: msg`Fastest (Whisper tiny)` },
  { id: "base", label: msg`Better (Whisper base)` },
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

function buildMicrophoneOptions(devices: MediaDeviceInfo[], t: I18n["_"]) {
  const microphones = devices.filter((device) => device.kind === "audioinput");
  return [
    { id: SYSTEM_MICROPHONE_ID, label: t(msg`System default`) },
    ...microphones.map((device, index) => {
      const fallbackNumber = index + 1;
      return {
        id: device.deviceId,
        label:
          device.label ||
          t(
            msg({
              message: `Microphone ${fallbackNumber}`,
              comment: "Fallback microphone device name with index",
            }),
          ),
      };
    }),
  ];
}

export function AudioSettings() {
  const { t, i18n } = useLingui();
  const [microphoneOptions, setMicrophoneOptions] = useState([
    { id: SYSTEM_MICROPHONE_ID, label: t`System default` },
  ]);
  const microphoneDeviceId = useSharedSettings((s) => s.audio.microphoneDeviceId);
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton);
  const transcriptionLanguage = useSharedSettings((s) => s.audio.transcriptionLanguage);
  const transcriptionModel = useSharedSettings((s) => s.audio.transcriptionModel);
  const useWebGpu = useSharedSettings((s) => s.audio.useWebGpu);
  const setAudioSetting = useSharedSettings((s) => s.setAudioSetting);

  const modelOpts = useLocalizedOptions(modelOptions);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    let disposed = false;
    const refresh = () => {
      void mediaDevices.enumerateDevices().then((devices) => {
        if (!disposed) {
          setMicrophoneOptions(buildMicrophoneOptions(devices, i18n._.bind(i18n)));
        }
      });
    };

    refresh();
    mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      disposed = true;
      mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, [i18n]);

  return (
    <SettingsPage title={t`Audio`} bodyClassName="space-y-5">
      <SettingRow
        title={t`Show voice input button`}
        description={<Trans>Show the microphone button in the composer.</Trans>}
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
      <SettingRow
        title={t`Microphone`}
        description={<Trans>Device used by the composer voice input button.</Trans>}
      >
        <Select
          aria-label={t`Microphone`}
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
        title={t`Test microphone`}
        description={<Trans>Check the live input level from the selected device.</Trans>}
      >
        <MicrophoneTestBar microphoneDeviceId={microphoneDeviceId} />
      </SettingRow>
      <SettingRow
        title={t`Voice input language`}
        description={
          <Trans>
            Language the speech model should expect when transcribing composer dictation.
          </Trans>
        }
      >
        <Select
          aria-label={t`Voice input language`}
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
        title={t`Voice input model`}
        description={<Trans>Fastest uses Whisper tiny; Better uses Whisper base.</Trans>}
      >
        <Select
          aria-label={t`Voice input model`}
          className="w-[280px] shrink-0"
          options={modelOpts}
          value={transcriptionModel}
          onChange={(value) => {
            startTransition(() => {
              setAudioSetting("transcriptionModel", value as AudioTranscriptionModel);
            });
          }}
        />
      </SettingRow>
      <SettingRow
        title={t`Use WebGPU acceleration`}
        description={<Trans>Run local transcription on the GPU when available.</Trans>}
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
  const { t } = useLingui();
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
      toast.danger(t`Microphone testing is not available in this environment.`);
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
        {isTesting
          ? t({ message: "Stop", comment: "Button: stop the microphone level test" })
          : isStarting
            ? t({
                message: "Starting",
                comment: "Button label while the microphone test is starting",
              })
            : t({ message: "Start", comment: "Button: start the microphone level test" })}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>
            <Trans>Input level</Trans>
          </span>
          <span className="tabular-nums">
            {isTesting
              ? `${Math.round(level * 100)}%`
              : t({ message: "Idle", comment: "Microphone input level when not testing" })}
          </span>
        </div>
        <div
          aria-label={t`Microphone input level`}
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
