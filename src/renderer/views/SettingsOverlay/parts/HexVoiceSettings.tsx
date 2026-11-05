import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button, ConfirmDialog } from "@/renderer/components/common";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HexVoiceError } from "@/renderer/speech/hexVoice";
import { useHexVoiceSession } from "@/renderer/speech/useHexVoiceSession";
import type { HexVoiceModel, HexVoiceSetup } from "@/shared/contracts/hexVoice";
import { deriveHexSetup, type HexActionError, type HexSetupStep } from "./hexSetupState";
import { HexSetupDialog } from "./HexSetupDialog";
import { SettingRow } from "./SettingsForm";

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
  const [error, setError] = useState<HexActionError | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    engine,
    preparation,
    installing,
    engineInstalled,
    preparing,
    selected,
    ready,
    preparingName,
  } = deriveHexSetup(setup, models, model);
  const hostName = setup?.hostName ?? "";
  const processingLocation = isRemoteSession()
    ? hostName
      ? t`Recordings are processed on ${hostName}, not on this device.`
      : t`Connect to your host to set up Hex.`
    : t`Recordings are processed locally on this host.`;
  const currentError = !session
    ? new HexVoiceError("disconnected").message
    : (connectionError ??
      error?.message ??
      (engine?.error ? new HexVoiceError(engine.error).message : null) ??
      (preparation?.phase === "error" && preparation.error
        ? new HexVoiceError(preparation.error).message
        : null));
  let status = t`Setup required`;
  let statusTone: "text-danger" | "text-success" | "" = "";
  if (!session || connectionError) {
    status = currentError ?? "";
    statusTone = "text-danger";
  } else if (error) {
    status = error.message;
    statusTone = "text-danger";
  } else if (installing) {
    status =
      engine?.progress !== undefined
        ? t`Installing engine… ${Math.round(engine.progress)}%`
        : t`Installing engine…`;
  } else if (preparing) {
    const progress = preparation?.progress;
    status =
      progress !== undefined
        ? t`Preparing ${preparingName}… ${Math.round(progress)}%`
        : t`Preparing ${preparingName}…`;
  } else if (ready && selected) {
    status = t`Ready · ${selected.name}`;
    statusTone = "text-success";
  } else if (currentError) {
    status = currentError;
    statusTone = "text-danger";
  } else if (engineInstalled) {
    status = t`Download a voice model to finish setup.`;
  }

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
    if (!session || !engineInstalled || preparing) return;
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
          setError({
            step: "model",
            message: reason instanceof Error ? reason.message : t`Unable to load voice models.`,
          });
      },
    );
    return () => {
      disposed = true;
    };
  }, [session, language, engineInstalled, preparing, t]);

  async function refreshSetup() {
    if (!session) return;
    const value = await session.setup();
    setSetup(value);
    if (value.engine.state === "installed" && value.preparation?.phase !== "preparing") {
      setModels(await session.list(language));
    } else if (value.engine.state !== "installed") {
      setModels([]);
    }
  }

  async function act(step: HexSetupStep, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshSetup();
    } catch (reason) {
      setError({
        step,
        message: reason instanceof Error ? reason.message : t`Unable to prepare voice model.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingRow
        anchorId="audio.hexModel"
        title={t`Hex setup`}
        description={
          <span role="status" className={statusTone}>
            {status}
          </span>
        }
      >
        <Button className="min-w-[5rem] shrink-0" onPress={() => setDialogOpen(true)}>
          {engineInstalled || installing ? t`Manage…` : t`Set up…`}
        </Button>
      </SettingRow>
      <HexSetupDialog
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        setup={setup}
        models={models}
        model={model}
        busy={busy || !session || Boolean(connectionError)}
        connectionError={!session ? new HexVoiceError("disconnected").message : connectionError}
        actionError={error}
        processingLocation={processingLocation}
        onModelChange={(value) => setAudioSetting("hexModel", value)}
        onInstall={() => session && void act("engine", () => session.install())}
        onCancelInstall={() => session && void act("engine", () => session.cancelInstall())}
        onRemove={() => setConfirmRemove(true)}
        onPrepare={() => session && void act("model", () => session.prepare(model, language))}
        onCancelPreparation={() =>
          session &&
          preparation &&
          void act("model", () => session.cancelPreparation(preparation.id))
        }
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
            void act("engine", async () => {
              await session.removeEngine();
              setModels([]);
              setConfirmRemove(false);
            });
        }}
      />
    </>
  );
}
