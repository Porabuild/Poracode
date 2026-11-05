import type { ReactNode } from "react";
import { Modal } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Download, ExternalLink } from "lucide-react";
import { Button, Select } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { HexVoiceError } from "@/renderer/speech/hexVoice";
import type { HexVoiceModel, HexVoiceSetup } from "@/shared/contracts/hexVoice";
import { deriveHexSetup, type HexActionError } from "./hexSetupState";

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

export interface HexSetupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  setup: HexVoiceSetup | null;
  models: readonly HexVoiceModel[];
  model: string;
  busy: boolean;
  connectionError: string | null;
  actionError: HexActionError | null;
  processingLocation: string;
  onModelChange: (model: string) => void;
  onInstall: () => void;
  onCancelInstall: () => void;
  onRemove: () => void;
  onPrepare: () => void;
  onCancelPreparation: () => void;
}

export function HexSetupDialog({
  isOpen,
  onOpenChange,
  setup,
  models,
  model,
  busy,
  connectionError,
  actionError,
  processingLocation,
  onModelChange,
  onInstall,
  onCancelInstall,
  onRemove,
  onPrepare,
  onCancelPreparation,
}: HexSetupDialogProps) {
  const { t } = useLingui();
  const {
    engine,
    preparation,
    installing,
    engineInstalled,
    preparing,
    selected,
    ready,
    updateAvailable,
    preparingName,
  } = deriveHexSetup(setup, models, model);
  const engineSize = engine?.downloadBytes ? Math.ceil(engine.downloadBytes / 1_000_000) : null;
  const modelSize = selected?.downloadBytes ? Math.ceil(selected.downloadBytes / 1_000_000) : null;
  const hostLine = setup ? `${setup.hostName} · ${setup.platform} · ${setup.arch}` : null;

  const engineDetail = (() => {
    if (!engine)
      return {
        detail: connectionError ? "" : t`Checking this host…`,
        tone: "muted" as const,
      };
    if (actionError?.step === "engine") {
      return { detail: actionError.message, tone: "danger" as const };
    }
    if (installing) {
      return {
        detail:
          engine.progress !== undefined
            ? t`Installing engine… ${Math.round(engine.progress)}%. Continues if you close this dialog.`
            : t`Installing engine… Continues if you close this dialog.`,
        tone: "muted" as const,
      };
    }
    if (engine.state === "unsupported") {
      return {
        detail:
          setup?.platform === "linux" && engine.error === "incompatible"
            ? t`This Hex release requires glibc 2.39 or newer on Linux. Use the built-in engine instead.`
            : t`Managed installation is not available on this host. Use a compatible external Hex engine or the built-in engine.`,
        tone: "muted" as const,
      };
    }
    if (engine.error) {
      return { detail: new HexVoiceError(engine.error).message, tone: "danger" as const };
    }
    if (engineInstalled && engine.source === "external") {
      return {
        detail: t`Using your existing Hex installation. Poracode will not modify it.`,
        tone: "muted" as const,
      };
    }
    if (engineInstalled) {
      return {
        detail: updateAvailable
          ? t`Hex ${engine.version} · Update to ${engine.availableVersion} available.`
          : engine.version
            ? t`Hex ${engine.version} · Managed by Poracode.`
            : t`Managed by Poracode. No separate app to open.`,
        tone: "muted" as const,
      };
    }
    return {
      detail: t`Poracode downloads and verifies Hex on this host. No administrator access is needed.`,
      tone: "muted" as const,
    };
  })();

  const engineAction = (() => {
    if (!setup || !engine) return null;
    if (installing) {
      return (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted"
          isDisabled={busy}
          onPress={onCancelInstall}
        >
          <Trans>Cancel</Trans>
        </Button>
      );
    }
    if (engine.state === "unsupported") return null;
    if (!engineInstalled) {
      return (
        <Button size="sm" variant="tertiary" isDisabled={busy || preparing} onPress={onInstall}>
          <Download className="size-3.5" aria-hidden="true" />
          {engineSize ? t`Install · ${engineSize} MB` : t`Install`}
        </Button>
      );
    }
    if (engine.source === "external") return null;
    return (
      <>
        {updateAvailable ? (
          <Button size="sm" variant="tertiary" isDisabled={busy || preparing} onPress={onInstall}>
            <Trans>Update</Trans>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted"
          isDisabled={busy || preparing}
          onPress={onRemove}
        >
          <Trans>Remove</Trans>
        </Button>
      </>
    );
  })();

  const modelDetail = (() => {
    if (!engineInstalled) {
      return {
        detail: t`Available models appear after the engine is installed.`,
        tone: "muted" as const,
      };
    }
    if (actionError?.step === "model") {
      return { detail: actionError.message, tone: "danger" as const };
    }
    if (preparing) {
      const progress = preparation?.progress;
      return {
        detail:
          progress !== undefined
            ? t`Preparing ${preparingName}… ${Math.round(progress)}%. Continues if you close this dialog.`
            : t`Preparing ${preparingName}… Continues if you close this dialog.`,
        tone: "muted" as const,
      };
    }
    if (preparation?.phase === "error" && preparation.error) {
      return { detail: new HexVoiceError(preparation.error).message, tone: "danger" as const };
    }
    if (ready) return { detail: t`Ready for dictation.`, tone: "success" as const };
    if (selected) {
      return {
        detail: `${t(
          modelDescriptions[selected.id] ?? msg`Check the supported languages before downloading.`,
        )} ${t`Languages: ${selected.languages.join(", ")}`}`,
        tone: "muted" as const,
      };
    }
    return { detail: t`Select an available model for this language.`, tone: "muted" as const };
  })();

  const modelAction = (() => {
    if (preparing) {
      return (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted"
          isDisabled={busy}
          onPress={onCancelPreparation}
        >
          <Trans>Cancel</Trans>
        </Button>
      );
    }
    if (engineInstalled && selected && !ready) {
      return (
        <Button size="sm" variant="tertiary" isDisabled={busy} onPress={onPrepare}>
          {selected.installed ? t`Verify` : modelSize ? t`Download · ${modelSize} MB` : t`Download`}
        </Button>
      );
    }
    return null;
  })();

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[460px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{t`Hex setup`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3 p-4">
            <div className="min-h-8 text-xs">
              {connectionError ? (
                <p role="alert" className="line-clamp-2 text-danger" title={connectionError}>
                  {connectionError}
                </p>
              ) : (
                <>
                  <p className="truncate text-muted" title={processingLocation}>
                    {processingLocation}
                  </p>
                  <p className="truncate text-muted" title={hostLine ?? undefined}>
                    {hostLine ?? "\u00a0"}
                  </p>
                </>
              )}
            </div>
            <SetupStep
              number={1}
              complete={Boolean(engineInstalled)}
              title={t`Engine`}
              action={engineAction}
              detail={engineDetail.detail}
              tone={engineDetail.tone}
              progress={installing ? engine?.progress : null}
              progressLabel={t`Engine installation progress`}
            />
            <SetupStep
              number={2}
              complete={ready}
              title={t`Voice model`}
              action={modelAction}
              detail={modelDetail.detail}
              tone={modelDetail.tone}
              progress={preparing ? preparation?.progress : null}
              progressLabel={t`Model preparation progress`}
            >
              <Select
                aria-label={t`Hex voice model`}
                className="w-full"
                options={models.map((item) => ({
                  id: item.id,
                  label: item.installed && item.verified ? t`${item.name} · Installed` : item.name,
                  detail: item.downloadBytes
                    ? t`${Math.ceil(item.downloadBytes / 1_000_000)} MB download`
                    : t`Download size unavailable`,
                }))}
                value={model}
                isDisabled={busy || !engineInstalled || preparing || !models.length}
                onChange={onModelChange}
                placeholder={engineInstalled ? t`Select a model` : t`Install the engine first`}
              />
            </SetupStep>
            <p className="text-xs text-muted">
              <Trans>
                Audio is sent only to your selected host, not to a cloud transcription service.
                Recordings are limited to five minutes. Models have separate licenses; download size
                is not memory usage.
              </Trans>
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="ghost"
              className="mr-auto text-muted"
              onPress={() =>
                void readBridge().openExternal("https://github.com/anomalyco/hex#readme")
              }
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <Trans>Documentation and licenses</Trans>
            </Button>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Close</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function SetupStep({
  number,
  complete,
  title,
  action,
  detail,
  tone,
  progress,
  progressLabel,
  children,
}: {
  number: number;
  complete: boolean;
  title: string;
  action?: ReactNode;
  detail: string;
  tone: "muted" | "danger" | "success";
  progress: number | undefined | null;
  progressLabel: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-secondary/30 p-3"
    >
      <div className="flex min-h-8 items-center gap-3">
        <StepBadge number={number} complete={complete} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</h3>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
      {children ? <div className="pl-9">{children}</div> : null}
      <p
        {...(tone === "danger" ? { role: "alert" } : {})}
        title={detail}
        className={`line-clamp-2 min-h-8 pl-9 text-xs ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-muted"}`}
      >
        {detail}
      </p>
      <ProgressTrack
        className="ml-9"
        active={progress !== null}
        value={progress ?? undefined}
        label={progressLabel}
      />
    </section>
  );
}

function StepBadge({ number, complete }: { number: number; complete: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${complete ? "border-success/30 text-success" : "border-border text-muted"}`}
    >
      {complete ? <Check className="size-3.5" /> : number}
    </span>
  );
}

function ProgressTrack({
  active,
  value,
  label,
  className,
}: {
  active: boolean;
  value: number | undefined;
  label: string;
  className?: string;
}) {
  const percent = value === undefined ? undefined : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      {...(active
        ? {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            ...(percent === undefined ? {} : { "aria-valuenow": percent }),
          }
        : { "aria-hidden": true })}
      className={`h-1 overflow-hidden rounded-full bg-[var(--row-active)] ${active ? "" : "invisible"} ${className ?? ""}`}
    >
      <div
        className={`h-full rounded-full bg-foreground ${percent === undefined ? "w-1/3 animate-pulse" : "transition-[width] duration-300"}`}
        {...(percent === undefined ? {} : { style: { width: `${percent}%` } })}
      />
    </div>
  );
}
