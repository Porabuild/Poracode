import { useEffect, useRef, useState } from "react";
import { ActivityBridge } from "@poracode/activity-bridge";
import {
  BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT,
  setBrowserWebPushActive,
} from "@/renderer/browserNotificationPermission";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isNativeApp } from "../pwaInstall";
import { createBackgroundRemoteClient } from "../remoteSessionTransport";
import { getOrCreateDeviceId } from "../storage";
import { configureLiveActivities } from "./liveActivityController";
import { syncPushRegistration, teardownPushListeners, unregisterPush } from "./pushRegistration";
import { syncWebPushRegistration, unregisterWebPush } from "./webPushRegistration";

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
 * lifecycle. Native builds register APNs/FCM + Live Activity tokens; installed
 * PWAs register a standards-based Push API subscription. Plain browser tabs
 * stay inert because iOS only exposes Web Push to Home Screen web apps.
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
  const [browserPermissionRevision, setBrowserPermissionRevision] = useState(0);

  // Latest label read without re-running the effect below — a rename must not
  // tear down the running activity (see the deps note).
  const desktopLabelRef = useRef(desktopLabel);
  desktopLabelRef.current = desktopLabel;

  // Notification permission can change through a settings user gesture while
  // the connection identity remains stable. Turn that browser event (and the
  // Permissions API where supported) into an effect revision.
  useEffect(() => {
    if (isNativeApp() || typeof window === "undefined") return;
    const changed = () => setBrowserPermissionRevision((revision) => revision + 1);
    window.addEventListener(BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT, changed);
    let permissionStatus: PermissionStatus | undefined;
    if (navigator.permissions) {
      void navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          status.addEventListener("change", changed);
        })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener(BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT, changed);
      permissionStatus?.removeEventListener("change", changed);
    };
  }, []);

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
    const client = createBackgroundRemoteClient(endpoint, accessToken);
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

  // Installed PWA Web Push registration. Permission is requested from a user
  // gesture in either the launch disclosure or settings; this effect consumes
  // a granted permission and binds the browser subscription to the paired desktop.
  useEffect(() => {
    if (isNativeApp() || !desktopId || !endpoint || !accessToken) return;
    let cancelled = false;
    const client = createBackgroundRemoteClient(endpoint, accessToken);
    void (async () => {
      const deviceId = await getOrCreateDeviceId();
      if (cancelled) return;
      if (!notificationsEnabled) {
        await unregisterWebPush(client, deviceId);
        return;
      }
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        setBrowserWebPushActive(false);
        return;
      }
      if (!connected) return;
      try {
        await syncWebPushRegistration(client, { deviceId });
      } catch (error) {
        setBrowserWebPushActive(false);
        console.warn("[push] Web Push registration failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    browserPermissionRevision,
    connected,
    desktopId,
    endpoint,
    accessToken,
    notificationsEnabled,
  ]);
}
