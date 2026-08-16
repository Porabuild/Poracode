import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, Download, RefreshCw, RotateCcw } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { updateDownloadDisplay } from "@/renderer/state/updateDownloadDisplay";
import { useUpdateStore } from "@/renderer/state/updateStore";

interface StartupRecoveryScreenProps {
  onKeepWaiting: () => void;
}

function reportActionFailure(action: string, error: unknown): void {
  console.error(`[poracode][startup-recovery] ${action} failed`, error);
}

export function StartupRecoveryScreen(props: StartupRecoveryScreenProps) {
  const { t } = useLingui();
  const phase = useUpdateStore((state) => state.phase);
  const version = useUpdateStore((state) => state.version);
  const downloadPercent = useUpdateStore((state) => state.downloadPercent);
  const transferred = useUpdateStore((state) => state.downloadTransferred);
  const total = useUpdateStore((state) => state.downloadTotal);
  const errorMessage = useUpdateStore((state) => state.errorMessage);
  const { determinate, percent } = updateDownloadDisplay(downloadPercent, transferred, total);

  const checkForUpdates = () => {
    void readBridge()
      .checkForUpdate()
      .catch((error: unknown) => reportActionFailure("check-for-update", error));
  };

  const restart = () => {
    void readBridge()
      .relaunchApp()
      .catch((error: unknown) => reportActionFailure("restart", error));
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-default-50 p-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">
              <Trans>Startup is taking longer than expected</Trans>
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              <Trans>
                Poracode may be waiting on saved data or a background service. You can keep waiting,
                restart, or install an available update.
              </Trans>
            </p>
          </div>
        </div>

        {phase === "downloading" ? (
          <div
            className="mt-5 rounded-lg border border-border bg-background p-3"
            role="progressbar"
            aria-label={t`Downloading update`}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(determinate ? { "aria-valuenow": percent } : {})}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 text-muted">
                <Download className="size-3.5 animate-pulse" />
                <Trans>Downloading update</Trans>
              </span>
              {determinate ? (
                <span className="tabular-nums text-foreground">{percent}%</span>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--row-active)]">
              <div
                className={`h-full rounded-full bg-foreground ${
                  determinate ? "transition-[width] duration-300" : "w-1/2 animate-pulse"
                }`}
                style={determinate ? { width: `${percent}%` } : undefined}
              />
            </div>
          </div>
        ) : null}

        {phase === "error" && errorMessage ? (
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onPress={props.onKeepWaiting}>
            <Trans>Keep waiting</Trans>
          </Button>
          <Button size="sm" variant="secondary" onPress={restart}>
            <RotateCcw className="size-3.5" />
            <Trans>Restart Poracode</Trans>
          </Button>
          {phase === "downloaded" ? (
            <Button size="sm" variant="primary" onPress={() => void readBridge().installUpdate()}>
              <RefreshCw className="size-3.5" />
              {version ? t`Install v${version}` : t`Install update`}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={phase === "checking" || phase === "downloading"}
              onPress={checkForUpdates}
            >
              {phase === "checking" ? (
                <PixelLoader size="sm" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {phase === "checking" ? <Trans>Checking…</Trans> : <Trans>Check for updates</Trans>}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
