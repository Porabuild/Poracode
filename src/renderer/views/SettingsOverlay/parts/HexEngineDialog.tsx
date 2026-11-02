import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Download } from "lucide-react";
import { Button } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import type { HexVoiceSetup } from "@/shared/contracts/hexVoice";

export function HexEngineDialog({
  isOpen,
  onOpenChange,
  setup,
  busy,
  error,
  processingLocation,
  onInstall,
  onCancelInstall,
  onRemove,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  setup: HexVoiceSetup | null;
  busy: boolean;
  error: string | null;
  processingLocation: string;
  onInstall: () => void;
  onCancelInstall: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const engine = setup?.engine;
  const installing = engine?.state === "installing";
  const preparing = setup?.preparation?.phase === "preparing";
  const size = engine?.downloadBytes ? Math.ceil(engine.downloadBytes / 1_000_000) : null;
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[460px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{t`Manage Hex`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-4 p-4">
            <p className="text-xs text-muted">{processingLocation}</p>
            {setup && (
              <p className="text-xs text-muted">
                {setup.hostName} · {setup.platform} · {setup.arch}
                {engine?.version ? ` · Hex ${engine.version}` : ""}
              </p>
            )}
            <p className="text-sm">
              {engine?.source === "external"
                ? t`Using your existing Hex installation. Poracode will not modify it.`
                : engine?.state === "installed"
                  ? t`Managed by Poracode. No separate app to open.`
                  : t`Poracode downloads and verifies Hex on this host. No administrator access is needed.`}
            </p>
            {engine?.state === "unsupported" ? (
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <Trans>
                    Managed installation is not available on this host. Use a compatible external
                    Hex engine or the built-in backend.
                  </Trans>
                </p>
                {setup?.platform === "linux" && engine.error === "incompatible" && (
                  <p>
                    <Trans>This Hex release requires glibc 2.39 or newer on Linux.</Trans>
                  </p>
                )}
              </div>
            ) : installing ? (
              <div className="space-y-2" role="status">
                <div className="flex justify-between gap-3 text-sm">
                  <span>
                    <Trans>Installing engine…</Trans>
                  </span>
                  <span>
                    {engine.progress === undefined ? "" : `${Math.round(engine.progress)}%`}
                  </span>
                </div>
                <progress
                  aria-label={t`Engine installation progress`}
                  className="h-1.5 w-full accent-current"
                  max={100}
                  {...(engine.progress === undefined ? {} : { value: engine.progress })}
                />
                <p className="text-xs text-muted">
                  <Trans>Installation continues when you close this dialog.</Trans>
                </p>
                <Button size="sm" variant="ghost" isDisabled={busy} onPress={onCancelInstall}>
                  <Trans>Cancel installation</Trans>
                </Button>
              </div>
            ) : engine?.state !== "installed" ? (
              <Button
                variant="tertiary"
                isDisabled={busy || !engine || preparing}
                onPress={onInstall}
              >
                <Download className="size-4" aria-hidden="true" />
                {size ? t`Install Hex · ${size} MB` : t`Install Hex`}
              </Button>
            ) : engine.source === "managed" ? (
              <div className="flex flex-wrap gap-2">
                {engine.version !== engine.availableVersion && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={busy || preparing}
                    onPress={onInstall}
                  >
                    <Trans>Update engine</Trans>
                  </Button>
                )}
                <Button size="sm" variant="ghost" isDisabled={busy || preparing} onPress={onRemove}>
                  <Trans>Remove managed engine</Trans>
                </Button>
              </div>
            ) : null}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="space-y-3 border-t border-border pt-3 text-xs text-muted">
              <p>
                <Trans>
                  Audio is sent only to your selected host, not to a cloud transcription service.
                  Recordings are limited to five minutes. Models have separate licenses; download
                  size is not memory usage.
                </Trans>
              </p>
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  void readBridge().openExternal("https://github.com/anomalyco/hex#readme")
                }
              >
                <Trans>Hex documentation and licenses</Trans>
              </Button>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Close</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
