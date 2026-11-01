import { useEffect, useState } from "react";
import { Check, Server } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Button, ConfirmDialog, Select } from "@/renderer/components/common";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HexVoiceError } from "@/renderer/speech/hexVoice";
import { useHexVoiceSession } from "@/renderer/speech/useHexVoiceSession";
import type { HexVoiceModel, HexVoiceSetup } from "@/shared/contracts/hexVoice";
import { HexEngineDialog } from "./HexEngineDialog";

const modelDescriptions: Record<string, MessageDescriptor> = {
  parakeet_unified_en: msg`English speech recognition.`,
  parakeet_v2: msg`English speech recognition.`,
  parakeet_v3: msg`Multilingual dictation for the supported languages.`,
  whisper_large_v3_turbo: msg`Whisper with broad multilingual support.`,
  qwen3_asr06_b: msg`Multilingual speech recognition.`,
  qwen_cleo_asr17_b: msg`Egyptian Arabic speech with English terms.`,
  sense_voice_small: msg`Speech recognition for supported East Asian languages and English.`,
  cohere_transcribe: msg`Multilingual speech recognition.`,
  underdog_bark_3_pro: msg`English dictation based on Parakeet.`,
  underdog_bark_3_clean: msg`English dictation with filler-word removal.`,
};

export function HexVoiceSettings({ language }: { language: string }) {
  const session = useHexVoiceSession();
  const [owner, setOwner] = useState({ session, generation: 0 });
  if (owner.session !== session) setOwner({ session, generation: owner.generation + 1 });
  return (
    <HexVoiceSetupPanel
      key={`${owner.generation}:${language}`}
      language={language}
      session={session}
    />
  );
}

function HexVoiceSetupPanel({
  language,
  session,
}: {
  language: string;
  session: ReturnType<typeof useHexVoiceSession>;
}) {
  const { t } = useLingui();
  const model = useSharedSettings((s) => s.audio.hexModel);
  const setAudioSetting = useSharedSettings((s) => s.setAudioSetting);
  const [setup, setSetup] = useState<HexVoiceSetup | null>(null);
  const [models, setModels] = useState<HexVoiceModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [manageEngine, setManageEngine] = useState(false);
  const engine = setup?.engine;
  const preparation = setup?.preparation;
  const preparing = preparation?.phase === "preparing";
  const installing = engine?.state === "installing";
  const selected = models.find((item) => item.id === model);
  const ready =
    engine?.state === "installed" && !preparing && selected?.installed && selected.verified;
  const downloadSize = selected?.downloadBytes
    ? Math.ceil(selected.downloadBytes / 1_000_000)
    : null;
  const progress = installing ? engine.progress : preparing ? preparation.progress : undefined;
  const hostName = setup?.hostName ?? "";
  const processingLocation = isRemoteSession()
    ? hostName
      ? t`Recordings are processed on ${hostName}, not on this device.`
      : t`Connect to your host to set up Hex.`
    : t`Recordings are processed locally on this host.`;
  const currentError = !session
    ? new HexVoiceError("disconnected").message
    : (connectionError ??
      error ??
      (engine?.error ? new HexVoiceError(engine.error).message : null) ??
      (preparation?.phase === "error" && preparation.error
        ? new HexVoiceError(preparation.error).message
        : null));

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await session!.setup();
        if (!disposed) {
          setSetup(value);
          setConnectionError(null);
        }
      } catch (reason) {
        if (!disposed)
          setConnectionError(
            reason instanceof Error ? reason.message : t`Unable to load voice models.`,
          );
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 2_000);
      }
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [session, t]);

  useEffect(() => {
    if (!session || engine?.state !== "installed" || preparing) return;
    let disposed = false;
    void session.list(language).then(
      (items) => {
        if (!disposed) {
          setModels(items);
          setError(null);
        }
      },
      (reason: unknown) => {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : t`Unable to load voice models.`);
      },
    );
    return () => {
      disposed = true;
    };
  }, [session, language, engine?.state, preparing, t]);

  async function refreshSetup() {
    if (!session) return;
    const value = await session.setup();
    setSetup(value);
    if (value.engine.state === "installed" && value.preparation?.phase !== "preparing") {
      setModels(await session.list(language));
    } else {
      setModels([]);
    }
  }

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshSetup();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t`Unable to prepare voice model.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="audio.hexModel"
      data-settings-anchor="audio.hexModel"
      aria-label={t`Hex setup`}
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-surface-secondary/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Server className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <h3 className="text-sm font-medium">
            <Trans>Hex setup</Trans>
          </h3>
        </div>
        <span className={`text-xs ${ready ? "text-success" : "text-muted"}`} role="status">
          {ready
            ? t`Ready for dictation`
            : installing
              ? t`Installing engine…`
              : preparing
                ? t`Preparing model…`
                : t`Setup required`}
        </span>
      </div>
      <div className="space-y-5 p-4">
        <p className="text-xs text-muted">{processingLocation}</p>
        <div className="flex items-start gap-3">
          <Step complete={engine?.state === "installed"} number={1} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-medium">
                <Trans>Install the engine</Trans>
              </h4>
              {engine?.version && <span className="text-xs text-muted">Hex {engine.version}</span>}
            </div>
            <p className="text-xs text-muted">
              {engine?.source === "external"
                ? t`Using your existing Hex installation. Poracode will not modify it.`
                : engine?.state === "installed"
                  ? t`Managed by Poracode. No separate app to open.`
                  : t`Poracode downloads and verifies Hex on this host. No administrator access is needed.`}
            </p>
            <Button size="sm" variant="tertiary" onPress={() => setManageEngine(true)}>
              {engine?.state === "installed" || installing ? t`Manage Hex…` : t`Set up Hex…`}
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Step complete={Boolean(ready)} number={2} />
          <div className="min-w-0 flex-1 space-y-3">
            <h4 className="text-sm font-medium">
              <Trans>Choose a voice model</Trans>
            </h4>
            {engine?.state === "installed" ? (
              <>
                <Select
                  aria-label={t`Hex voice model`}
                  className="w-full"
                  options={models.map((item) => ({
                    id: item.id,
                    label:
                      item.installed && item.verified ? t`${item.name} · Installed` : item.name,
                    detail: item.downloadBytes
                      ? t`${Math.ceil(item.downloadBytes / 1_000_000)} MB download`
                      : t`Download size unavailable`,
                  }))}
                  value={model}
                  isDisabled={busy || preparing || !models.length}
                  onChange={(value) => setAudioSetting("hexModel", value)}
                />
                {!selected && !preparing && (
                  <p className="text-xs text-muted">
                    <Trans>Select an available model for this language.</Trans>
                  </p>
                )}
                {selected && (
                  <p className="text-xs text-muted">
                    {t(
                      modelDescriptions[selected.id] ??
                        msg`Check the supported languages before downloading.`,
                    )}
                  </p>
                )}
                {selected && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      {downloadSize ? t`${downloadSize} MB download` : t`Download size unavailable`}
                    </span>
                    <span>{t`Languages: ${selected.languages.join(", ")}`}</span>
                  </div>
                )}
                {preparing ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      <Trans>
                        Preparation continues when you leave settings. You can return here to check
                        progress.
                      </Trans>
                    </p>
                    <p className="text-xs text-muted">{preparation.model}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy}
                      onPress={() =>
                        session && void act(() => session.cancelPreparation(preparation.id))
                      }
                    >
                      <Trans>Cancel download</Trans>
                    </Button>
                  </div>
                ) : (
                  !ready && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={busy || !selected || !session}
                      onPress={() => session && void act(() => session.prepare(model, language))}
                    >
                      {selected?.installed
                        ? t`Verify model`
                        : downloadSize
                          ? t`Download model · ${downloadSize} MB`
                          : t`Download model`}
                    </Button>
                  )
                )}
                {ready && (
                  <p className="text-xs text-success">
                    <Trans>Model ready. Try a short recording below.</Trans>
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted">
                <Trans>Available models will appear after the engine is installed.</Trans>
              </p>
            )}
          </div>
        </div>
        {(installing || preparing) && (
          <div className="space-y-1" role="status">
            <div className="flex justify-between gap-3 text-xs text-muted">
              <span>{installing ? t`Installing engine…` : t`Preparing model…`}</span>
              <span>{progress === undefined ? "" : `${Math.round(progress)}%`}</span>
            </div>
            <progress
              aria-label={
                installing ? t`Engine installation progress` : t`Model preparation progress`
              }
              className="h-1.5 w-full accent-current"
              max={100}
              {...(progress === undefined ? {} : { value: progress })}
            />
          </div>
        )}
        {currentError && (
          <p role="alert" className="text-xs text-danger">
            {currentError}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="ghost"
            isDisabled={busy || !session || installing || preparing}
            onPress={() => {
              setError(null);
              void refreshSetup().catch((reason: unknown) => {
                setError(
                  reason instanceof Error ? reason.message : t`Unable to load voice models.`,
                );
              });
            }}
          >
            <Trans>Refresh</Trans>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setAudioSetting("transcriptionBackend", "transformers")}
          >
            <Trans>Use built-in transcription</Trans>
          </Button>
        </div>
      </div>
      <HexEngineDialog
        isOpen={manageEngine}
        onOpenChange={setManageEngine}
        setup={setup}
        busy={busy || !session || Boolean(connectionError)}
        error={currentError}
        processingLocation={processingLocation}
        onInstall={() => session && void act(() => session.install())}
        onCancelInstall={() => session && void act(() => session.cancelInstall())}
        onRemove={() => setConfirmRemove(true)}
      />
      <ConfirmDialog
        isOpen={confirmRemove}
        title={t`Remove Hex engine?`}
        body={t`This removes only the engine installed by Poracode. Downloaded models and external Hex installations are kept.`}
        confirmLabel={t`Remove engine`}
        isPending={busy}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          if (session)
            void act(async () => {
              await session.removeEngine();
              setModels([]);
              setConfirmRemove(false);
            });
        }}
      />
    </section>
  );
}

function Step({ complete, number }: { complete: boolean; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${complete ? "border-success/30 text-success" : "border-border text-muted"}`}
    >
      {complete ? <Check className="size-3.5" /> : number}
    </span>
  );
}
