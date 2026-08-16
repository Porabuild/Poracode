import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { ConfirmDialog, PixelLoader } from "@/renderer/components/common";
import { updateDownloadDisplay } from "@/renderer/state/updateDownloadDisplay";
import { useUpdateStore } from "@/renderer/state/updateStore";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { productNameFor } from "@/shared/channel";
import { SettingRow, SettingsPage } from "./SettingsForm";
import appIconStableUrl from "../../../../../build/icon.png";
import appIconNightlyUrl from "../../../../../build/icon-nightly.png";

const GITHUB_REPO = "https://github.com/SDSLeon/lightcode";
const WEBSITE_URL = "https://poracode.com/";

function AboutLink(props: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      onClick={() => void readBridge().openExternal(props.href)}
    >
      {props.children}
      <ExternalLink className="size-3" />
    </button>
  );
}

function UpdateButton() {
  const { t } = useLingui();
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const transferred = useUpdateStore((s) => s.downloadTransferred);
  const total = useUpdateStore((s) => s.downloadTotal);

  if (phase === "checking") {
    return (
      <Button size="sm" isDisabled variant="ghost">
        <PixelLoader size="sm" />
        <Trans>Checking…</Trans>
      </Button>
    );
  }

  if (phase === "downloading") {
    // Single-line, fixed-height status so the Version row keeps a constant
    // height across phases (no layout jump). `tabular-nums` keeps the digits
    // from reflowing as the numbers tick up. The target version is intentionally
    // omitted here — the Version row already shows it and the long nightly
    // string was what overflowed and got clipped.
    const { determinate, percent, byteLine } = updateDownloadDisplay(
      downloadPercent,
      transferred,
      total,
    );

    return (
      <div
        className="flex items-center gap-2.5 text-xs text-muted"
        role="progressbar"
        aria-label={t`Downloading update`}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(determinate ? { "aria-valuenow": percent } : {})}
      >
        <Download className="size-3.5 shrink-0 animate-pulse text-foreground" />
        {byteLine ? <span className="whitespace-nowrap tabular-nums">{byteLine}</span> : null}
        <div className="h-1 w-20 overflow-hidden rounded-full bg-[var(--row-active)]">
          <div
            className={`h-full rounded-full bg-foreground ${
              determinate ? "transition-[width] duration-300" : "w-1/2 animate-pulse"
            }`}
            style={determinate ? { width: `${percent}%` } : undefined}
          />
        </div>
        {determinate ? (
          <span className="w-8 text-right tabular-nums text-foreground">{percent}%</span>
        ) : null}
      </div>
    );
  }

  if (phase === "downloaded") {
    const label = version ? t`Install v${version}` : t`Install update`;
    return (
      <Button size="sm" variant="tertiary" onPress={() => void readBridge().installUpdate()}>
        <RefreshCw className="size-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onPress={() =>
        void readBridge()
          .checkForUpdate()
          .catch((error: unknown) => {
            // Updater failures already surface via onUpdateStatus (toast). This
            // catch only keeps an IPC transport rejection from bubbling to the
            // window as an unhandled rejection, which renders the crash screen.
            console.error("[poracode][updates] check-for-update failed", error);
          })
      }
    >
      <Trans>Check for updates</Trans>
    </Button>
  );
}

export function AboutSettings() {
  const { t } = useLingui();
  const bridge = readBridge();
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const productName = productNameFor(bridge.channel);
  const appIconUrl = bridge.channel === "nightly" ? appIconNightlyUrl : appIconStableUrl;
  const currentYear = new Date().getFullYear();

  const importLegacyData = async () => {
    setShowMigrationConfirm(false);
    setMigrationPending(true);
    try {
      const result = await bridge.requestLegacyDataMigration();
      if (result.status === "no-legacy-data") {
        toast.warning(t`No Lightcode data was found.`);
        return;
      }
      if (result.status === "unavailable") {
        toast.warning(t`Lightcode data import is unavailable with a custom data folder.`);
        return;
      }
      await bridge.relaunchApp();
    } catch (error) {
      toast.danger(
        error instanceof Error ? error.message : t`Couldn't schedule the Lightcode data import.`,
      );
    } finally {
      setMigrationPending(false);
    }
  };

  return (
    <>
      <SettingsPage title={t`About`} bodyClassName="">
        <div className="mb-8 flex items-center gap-4">
          <img src={appIconUrl} alt={productName} className="size-12 shrink-0 rounded-lg" />
          <div>
            <p className="text-lg text-foreground">
              <BrandWordmark />
            </p>
            <p className="text-xs text-muted">
              <Trans>
                AI agent orchestrator — manage coding agents via Terminal and Native ACP.
              </Trans>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                <Trans comment="About page label: app version row">Version</Trans>
              </p>
              <p className="text-xs text-muted">{bridge.appVersion}</p>
            </div>
            <div className="shrink-0">
              <UpdateButton />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">
              <Trans comment="About page label: release channel (stable/nightly)">Channel</Trans>
            </p>
            <p className="text-sm text-muted capitalize">{bridge.channel}</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">
              <Trans comment="About page label: Electron framework version">Electron</Trans>
            </p>
            <p className="text-sm text-muted">{bridge.electronVersion}</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">
              <Trans comment="About page label: software license row">License</Trans>
            </p>
            <p className="text-sm text-muted">Apache-2.0</p>
          </div>
        </div>

        {!isRemoteSession() && !bridge.isDev ? (
          <div className="mt-8 border-t border-[var(--hairline)] pt-6">
            <SettingRow
              title={t`Import Lightcode data`}
              description={
                <Trans>
                  Copy all Lightcode data into Poracode. Poracode restarts and keeps a complete
                  backup of its current data.
                </Trans>
              }
            >
              <Button
                size="sm"
                variant="secondary"
                isPending={migrationPending}
                onPress={() => setShowMigrationConfirm(true)}
              >
                <Trans>Import again</Trans>
              </Button>
            </SettingRow>
          </div>
        ) : null}

        <div className="mt-8 space-y-3 border-t border-[var(--hairline)] pt-6">
          <AboutLink href={WEBSITE_URL}>
            <Trans comment="External link to the product website">Website</Trans>
          </AboutLink>
          <br />
          <AboutLink href={GITHUB_REPO}>
            <Trans>GitHub Repository</Trans>
          </AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/releases`}>
            <Trans comment="Link to the list of release notes">Changelog</Trans>
          </AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/issues`}>
            <Trans>Report an Issue</Trans>
          </AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/blob/master/LICENSE`}>
            <Trans comment="Link to the license file">License</Trans>
          </AboutLink>
        </div>

        <p className="mt-8 text-xs text-muted">
          <Trans>&copy; {currentYear} Serhii Vecherenko. All rights reserved.</Trans>
        </p>
      </SettingsPage>
      <ConfirmDialog
        isOpen={showMigrationConfirm}
        title={t`Import Lightcode data again?`}
        body={
          <Trans>
            Poracode will restart, back up its current data, and replace it with a complete copy of
            your Lightcode data.
          </Trans>
        }
        confirmLabel={t`Import and restart`}
        confirmVariant="primary"
        status="warning"
        onConfirm={() => void importLegacyData()}
        onClose={() => setShowMigrationConfirm(false)}
      />
    </>
  );
}
