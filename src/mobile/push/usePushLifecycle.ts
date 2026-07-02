import { useEffect } from "react";
import { ActivityBridge } from "@lightcode/activity-bridge";
import { RemoteDesktopClient } from "../remoteClient";
import { isNativeApp } from "../pwaInstall";
import { getOrCreateDeviceId, isPushEnabled } from "../storage";
import { configureLiveActivities } from "./liveActivityController";
import { syncPushRegistration, teardownPushListeners } from "./pushRegistration";

/** Just the connection fields the push lifecycle needs from the remote session. */
export interface PushLifecycleInput {
  readonly connected: boolean;
  readonly activeDesktop: {
    readonly desktopId: string;
    readonly endpoint: string;
    readonly accessToken: string;
    readonly label: string;
  } | null;
}

/**
 * Wires push notifications + foreground Live Activities into the remote-session
 * lifecycle. Entirely inert off the native app ({@link isNativeApp}), so the
 * PWA and web builds are unchanged.
 *
 * Two independent concerns:
 *  - Live Activity context tracks the active desktop identity (not the socket),
 *    so an activity keeps driving across reconnects and only tears down on a
 *    desktop switch / unpair.
 *  - Push registration runs once the socket is live AND the user opted this
 *    desktop into push. The fingerprint guard inside `syncPushRegistration`
 *    absorbs the reconnect churn that flips `connected` on every WS resume.
 */
export function usePushLifecycle(input: PushLifecycleInput): void {
  const { connected } = input;
  const desktop = input.activeDesktop;
  const desktopId = desktop?.desktopId;
  const desktopLabel = desktop?.label;
  const endpoint = desktop?.endpoint;
  const accessToken = desktop?.accessToken;

  // Live Activity context — keyed on the desktop identity.
  useEffect(() => {
    if (!isNativeApp() || !desktopId) return;
    let cancelled = false;
    void (async () => {
      try {
        const supported = await ActivityBridge.isSupported();
        if (!cancelled && supported.liveActivities) {
          configureLiveActivities({ desktopId, desktopName: desktopLabel ?? desktopId });
        }
      } catch {
        // Live Activities unsupported on this OS — stay inert.
      }
    })();
    return () => {
      cancelled = true;
      // Ends any running activity and clears tracked threads on switch/unpair.
      configureLiveActivities(null);
    };
  }, [desktopId, desktopLabel]);

  // Push registration — keyed on the live socket + desktop connection identity.
  useEffect(() => {
    if (!isNativeApp() || !connected || !desktopId || !endpoint || !accessToken) return;
    let cancelled = false;
    const client = new RemoteDesktopClient(endpoint, accessToken);
    void (async () => {
      const enabled = await isPushEnabled(desktopId);
      if (cancelled || !enabled) return;
      const deviceId = await getOrCreateDeviceId();
      if (cancelled) return;
      await syncPushRegistration(client, { deviceId });
    })();
    return () => {
      cancelled = true;
      void teardownPushListeners();
    };
  }, [connected, desktopId, endpoint, accessToken]);
}
