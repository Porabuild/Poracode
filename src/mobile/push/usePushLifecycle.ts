import { useEffect, useRef } from "react";
import { ActivityBridge } from "@poracode/activity-bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { RemoteDesktopClient } from "../remoteClient";
import { isNativeApp } from "../pwaInstall";
import { getOrCreateDeviceId } from "../storage";
import { configureLiveActivities } from "./liveActivityController";
import { syncPushRegistration, teardownPushListeners, unregisterPush } from "./pushRegistration";

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
 *  - Push registration follows the existing notification master switch. The
 *    fingerprint guard inside `syncPushRegistration` absorbs the reconnect
 *    churn that flips `connected` on every WS resume.
 */
export function usePushLifecycle(input: PushLifecycleInput): void {
  const notificationsEnabled = useSharedSettings((state) => state.notificationsEnabled);
  const { connected } = input;
  const desktop = input.activeDesktop;
  const desktopId = desktop?.desktopId;
  const desktopLabel = desktop?.label;
  const endpoint = desktop?.endpoint;
  const accessToken = desktop?.accessToken;

  // Latest label read without re-running the effect below — a rename must not
  // tear down the running activity (see the deps note).
  const desktopLabelRef = useRef(desktopLabel);
  desktopLabelRef.current = desktopLabel;

  // Live Activity context — keyed on the desktop identity.
  useEffect(() => {
    if (!isNativeApp() || !desktopId) return;
    let cancelled = false;
    void (async () => {
      try {
        const supported = await ActivityBridge.isSupported();
        if (!cancelled && supported.liveActivities) {
          configureLiveActivities({
            desktopId,
            desktopName: desktopLabelRef.current ?? desktopId,
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on desktopId only; a same-desktop rename updates desktopLabelRef without ending the running activity
  }, [desktopId]);

  // Desktop identity lifecycle: switching desktops, re-pairing (new token), or
  // unmounting leaves the previous desktop's registration scope. Clear the
  // fingerprint there; plain connected/offline flips below only detach
  // listeners and keep the reconnect dedupe state.
  useEffect(() => {
    if (!isNativeApp() || !desktopId || !endpoint || !accessToken) return;
    return () => {
      void teardownPushListeners({ resetSentState: true });
    };
  }, [desktopId, endpoint, accessToken]);

  // Push registration — keyed on the live socket + desktop connection identity.
  useEffect(() => {
    if (!isNativeApp() || !desktopId || !endpoint || !accessToken) return;
    let cancelled = false;
    const client = new RemoteDesktopClient(endpoint, accessToken);
    void (async () => {
      if (!notificationsEnabled) {
        await teardownPushListeners({ resetSentState: true });
        const deviceId = await getOrCreateDeviceId();
        if (!cancelled) await unregisterPush(client, deviceId);
        return;
      }
      if (!connected) return;
      const deviceId = await getOrCreateDeviceId();
      if (cancelled) return;
      await syncPushRegistration(client, { deviceId, shouldCancel: () => cancelled });
    })();
    return () => {
      cancelled = true;
      void teardownPushListeners();
    };
  }, [connected, desktopId, endpoint, accessToken, notificationsEnabled]);
}
