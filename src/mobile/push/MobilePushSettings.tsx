import { useEffect, useState } from "react";
import { Switch, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { useRemote } from "../remoteContext";
import { RemoteDesktopClient } from "../remoteClient";
import { getOrCreateDeviceId, isPushEnabled, setPushEnabled } from "../storage";
import { syncPushRegistration, teardownPushListeners, unregisterPush } from "./pushRegistration";

/**
 * Native-only push opt-in for the active desktop. Rendered inside the mobile
 * Notifications section (guarded by `isNativeApp()` at the call site), so it
 * never appears in the PWA — Live Activities and APNs need the Capacitor shell.
 *
 * The toggle both persists the per-desktop preference and drives registration:
 * on it requests permission and registers this device's tokens; off it drops
 * the desktop-side registration so no more pushes are sent here.
 */
export function MobilePushSettings() {
  const { t } = useLingui();
  const { activeDesktop } = useRemote();
  const desktopId = activeDesktop?.desktopId ?? null;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktopId) return;
    let cancelled = false;
    void isPushEnabled(desktopId).then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [desktopId]);

  const toggle = async (next: boolean) => {
    if (!activeDesktop) return;
    setBusy(true);
    setEnabled(next);
    try {
      await setPushEnabled(activeDesktop.desktopId, next);
      const client = new RemoteDesktopClient(activeDesktop.endpoint, activeDesktop.accessToken);
      const deviceId = await getOrCreateDeviceId();
      if (next) {
        await syncPushRegistration(client, { deviceId });
      } else {
        await teardownPushListeners();
        await unregisterPush(client, deviceId);
      }
    } catch {
      // Registration failures are quiet by design; keep the preference as set.
      toast.warning(t`Push notifications may be unavailable for this desktop.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="space-y-4 border-t border-border/60 pt-6">
        <SettingRow
          title={t`Push notifications`}
          description={
            <Trans>
              Get alerts through Apple&apos;s push service when this desktop&apos;s threads finish
              or need you — even while the app is closed.
            </Trans>
          }
        >
          <Switch
            isSelected={enabled}
            isDisabled={busy || !desktopId}
            aria-label={t`Push notifications`}
            onChange={(next) => void toggle(next)}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingRow>
      </div>
    </div>
  );
}
