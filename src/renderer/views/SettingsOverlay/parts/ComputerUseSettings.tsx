import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { PixelLoader, ToggleSwitch } from "@/renderer/components/common";
import { isMac, readBridge } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type {
  LockedComputerUseActionResult,
  LockedComputerUseErrorCode,
  LockedComputerUseStatus,
} from "@/shared/contracts/lockedComputerUse";
import { SettingRow, SettingsPage } from "./SettingsForm";

type PendingAction = "install" | "uninstall";

export function ComputerUseSettings() {
  const { t } = useLingui();
  // Installing changes this Mac's login rules behind an administrator prompt,
  // so only the desktop that owns the host may do it; every other client
  // (paired browser, phone, a desktop attached to another host) reads only.
  const localDesktop = hasClientCapability("localBackend");
  return (
    <SettingsPage title={t`Computer Use`}>
      {localDesktop && isMac() ? (
        <LockedComputerUseControl />
      ) : (
        <SettingRow
          anchorId="computerUse.lockedUse"
          title={t`Locked Computer Use`}
          description={
            localDesktop
              ? t`Locked Computer Use is available only on macOS.`
              : t`Locked Computer Use is set up in Poracode on the Mac it runs on.`
          }
        >
          {null}
        </SettingRow>
      )}
    </SettingsPage>
  );
}

function LockedComputerUseControl() {
  const { t } = useLingui();
  const enabled = useSharedSettings((s) => s.computerUseLockedUse);
  const setEnabled = useSharedSettings((s) => s.setComputerUseLockedUse);
  const dimDisplay = useSharedSettings((s) => s.computerUseLockedUseDimDisplay);
  const setDimDisplay = useSharedSettings((s) => s.setComputerUseLockedUseDimDisplay);
  const [status, setStatus] = useState<LockedComputerUseStatus | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<LockedComputerUseErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getLockedComputerUseStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setError("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (
    action: PendingAction,
    call: () => Promise<LockedComputerUseActionResult>,
  ): Promise<boolean> => {
    setPending(action);
    setError(null);
    try {
      const result = await call();
      setStatus(result.status);
      if (!result.ok) setError(result.error);
      return result.ok;
    } catch {
      setError("failed");
      return false;
    } finally {
      setPending(null);
    }
  };

  const install = async () => {
    // The installer is idempotent, but a healthy install needs no second
    // administrator prompt just to flip the user's intent back on.
    if (status?.installed) {
      setEnabled(true);
      return;
    }
    if (await run("install", () => readBridge().installLockedComputerUse())) setEnabled(true);
  };

  const uninstall = async () => {
    // Intent goes off first: the host stops unlocking at once, even if the
    // removal prompt is then cancelled.
    setEnabled(false);
    await run("uninstall", () => readBridge().uninstallLockedComputerUse());
  };

  const devBuild = status !== null && !status.signed && !status.installed;
  const canRepair = enabled && status !== null && !status.installed && !devBuild;

  return (
    <>
      <SettingRow
        anchorId="computerUse.lockedUse"
        title={t`Locked Computer Use`}
        description={t`Poracode briefly unlocks this Mac for an active Computer Use turn, covers every display while it works, and locks it again when the turn ends. Any key press or pointer movement on this Mac locks it immediately. Installing needs a one-time administrator approval. On a Mac managed by your organization, check with IT first.`}
      >
        <div className="flex shrink-0 items-center gap-2">
          {pending ? <PixelLoader size="xs" /> : null}
          <ToggleSwitch
            aria-label={t`Locked Computer Use`}
            isSelected={enabled}
            // Turning it off always stays possible, whatever the status says.
            isDisabled={pending !== null || status === null || (!enabled && devBuild)}
            onChange={(selected) => void (selected ? install() : uninstall())}
          />
        </div>
      </SettingRow>
      <p className="-mt-2 text-xs text-muted" data-testid="locked-use-status">
        {t(lockedUseStatusText(status, enabled, pending))}
      </p>
      <SettingRow
        anchorId="computerUse.lockedUseDimDisplay"
        title={t`Dim displays during Locked Computer Use`}
        description={t`Lower brightness on supported displays while the cover is visible, then restore the previous brightness when the Mac locks again.`}
      >
        <ToggleSwitch
          aria-label={t`Dim displays during Locked Computer Use`}
          isSelected={dimDisplay}
          isDisabled={!enabled || pending !== null}
          onChange={setDimDisplay}
        />
      </SettingRow>
      {canRepair ? (
        <Button
          size="sm"
          variant="tertiary"
          className="-mt-2"
          isDisabled={pending !== null}
          onPress={() => void run("install", () => readBridge().installLockedComputerUse())}
        >
          {t`Repair`}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="-mt-2 text-xs text-danger">
          {t(LOCKED_USE_ERROR_TEXT[error])}
        </p>
      ) : null}
    </>
  );
}

const LOCKED_USE_ERROR_TEXT: Record<LockedComputerUseErrorCode, MessageDescriptor> = {
  cancelled: msg`The administrator prompt was cancelled. Nothing was changed.`,
  unsupported_rule: msg`This Mac's screen unlock rule has been customized, for example by device management, so Locked Computer Use can't be installed. Check with your IT team.`,
  verification_failed: msg`Installation couldn't be verified, so it was rolled back. Nothing was changed.`,
  unsigned_build: msg`Locked Computer Use is unavailable in development builds.`,
  installer_missing: msg`This build doesn't include the Locked Computer Use installer.`,
  busy: msg`Another install or removal is already running.`,
  unsupported_platform: msg`Locked Computer Use couldn't be changed. Try again.`,
  usage: msg`Locked Computer Use couldn't be changed. Try again.`,
  not_root: msg`Locked Computer Use couldn't be changed. Try again.`,
  failed: msg`Locked Computer Use couldn't be changed. Try again.`,
};

function lockedUseStatusText(
  status: LockedComputerUseStatus | null,
  enabled: boolean,
  pending: PendingAction | null,
): MessageDescriptor {
  if (pending === "install") return msg`Waiting for administrator approval…`;
  if (pending === "uninstall") return msg`Removing…`;
  if (!status) return msg`Checking…`;
  if (!status.signed && !status.installed) return msg`Unavailable in development builds`;
  if (status.installed && status.paused) return msg`Paused until you unlock this Mac manually`;
  if (status.installed) return enabled ? msg`Installed` : msg`Installed, turned off`;
  if (status.needsRepair) return msg`Needs repair`;
  return msg`Not installed`;
}
