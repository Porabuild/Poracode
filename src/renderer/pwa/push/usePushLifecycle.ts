import { useEffect, useState } from "react";
import {
  BROWSER_NOTIFICATION_PERMISSION_CHANGED_EVENT,
  setBrowserWebPushActive,
} from "@/renderer/browserNotificationPermission";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { createBackgroundRemoteClient } from "../remoteSessionTransport";
import { getOrCreateBrowserDeviceId } from "../deviceId";
import { syncWebPushRegistration, unregisterWebPush } from "./webPushRegistration";

/** Just the connection fields the push lifecycle needs from the remote session. */
export interface PushLifecycleInput {
  readonly connected: boolean;
  readonly activeDesktop: {
    readonly desktopId: string;
    readonly endpoint: string;
    readonly accessToken: string;
  } | null;
}

/**
 * Wires Web Push into the remote-session lifecycle. Installed PWAs register a
 * standards-based Push API subscription; plain browser tabs stay inert because
 * iOS only exposes Web Push to Home Screen web apps.
 *
 * Registration follows the existing notification master switch, and is keyed on
 * the desktop connection identity so switching desktops or re-pairing rebinds
 * the subscription.
 *
 * The native iOS and Android apps do not run this renderer — they register APNs
 * and FCM tokens from their own Swift/Kotlin code.
 */
export function usePushLifecycle(input: PushLifecycleInput): void {
  const notificationsEnabled = useSharedSettings((state) => state.notificationsEnabled);
  const { connected } = input;
  const desktop = input.activeDesktop;
  const desktopId = desktop?.desktopId;
  const endpoint = desktop?.endpoint;
  const accessToken = desktop?.accessToken;
  const [browserPermissionRevision, setBrowserPermissionRevision] = useState(0);

  // Notification permission can change through a settings user gesture while
  // the connection identity remains stable. Turn that browser event (and the
  // Permissions API where supported) into an effect revision.
  useEffect(() => {
    if (typeof window === "undefined") return;
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

  // Installed PWA Web Push registration. Permission is requested from a user
  // gesture in either the launch disclosure or settings; this effect consumes
  // a granted permission and binds the browser subscription to the paired desktop.
  useEffect(() => {
    if (!desktopId || !endpoint || !accessToken) return;
    let cancelled = false;
    const client = createBackgroundRemoteClient(endpoint, accessToken);
    void (async () => {
      const deviceId = await getOrCreateBrowserDeviceId();
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
