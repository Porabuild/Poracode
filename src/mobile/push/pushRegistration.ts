import { PushNotifications } from "@capacitor/push-notifications";
import { ActivityBridge } from "@lightcode/activity-bridge";
import type { RemotePushRegistration } from "@/shared/remote";
import type { RemoteDesktopClient } from "../remoteClient";

/**
 * Push token registration for the native app.
 *
 * iOS: collects the ordinary APNs device token (via
 * `@capacitor/push-notifications`), plus the Live Activity push-to-start token
 * and per-activity update tokens (via `@lightcode/activity-bridge`).
 *
 * Android: the same `@capacitor/push-notifications` "registration" listener
 * yields the device's **FCM registration token** (Android has no native code
 * and no Live Activities), so the ActivityBridge steps are skipped entirely.
 *
 * Tokens arrive asynchronously and independently, so registration is a
 * sequence of PARTIAL upserts (the protocol preserves fields absent from a
 * payload). Every network call is best-effort and quiet: a desktop on an older
 * build has no `/api/push/*` endpoint and returns 404/503 — that must never
 * toast or throw, it just means push isn't available for that desktop yet.
 *
 * Inert on web/PWA: the caller only invokes it inside the native shell.
 */

/** Native platform, read from the Capacitor shell (matches pwaInstall.ts's
 * global-access style so no extra import/mock is needed). Anything other than
 * Android is treated as iOS — the only two native targets. */
function currentPlatform(): "ios" | "android" {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === "android" ? "android" : "ios";
}

export interface SyncPushOptions {
  readonly deviceId: string;
  readonly appVersion?: string;
}

/** The cumulative set of tokens already accepted by the desktop, per device. */
interface SentState {
  deviceToken?: string;
  pushToStartToken?: string;
  activityTokens: Record<string, string>;
  appVersion?: string;
}

const sentByDevice = new Map<string, SentState>();
/** Listener handles kept so a later desktop switch / teardown can detach them. */
let attached: Array<{ remove: () => Promise<void> }> = [];

function emptyState(): SentState {
  return { activityTokens: {} };
}

/** Merge an incoming partial onto the last-sent state (present replaces). */
function mergeSent(prev: SentState, reg: RemotePushRegistration): SentState {
  const deviceToken = reg.deviceToken ?? prev.deviceToken;
  const pushToStartToken = reg.pushToStartToken ?? prev.pushToStartToken;
  const appVersion = reg.appVersion ?? prev.appVersion;
  return {
    ...(deviceToken !== undefined ? { deviceToken } : {}),
    ...(pushToStartToken !== undefined ? { pushToStartToken } : {}),
    activityTokens: { ...prev.activityTokens, ...(reg.activityTokens ?? {}) },
    ...(appVersion !== undefined ? { appVersion } : {}),
  };
}

function sameState(a: SentState, b: SentState): boolean {
  if (a.deviceToken !== b.deviceToken) return false;
  if (a.pushToStartToken !== b.pushToStartToken) return false;
  if (a.appVersion !== b.appVersion) return false;
  const ak = Object.keys(a.activityTokens);
  const bk = Object.keys(b.activityTokens);
  if (ak.length !== bk.length) return false;
  return ak.every((key) => a.activityTokens[key] === b.activityTokens[key]);
}

/**
 * Fingerprint guard: send a partial registration only when it actually adds or
 * changes a token relative to what the desktop already has. This is what stops
 * reconnect churn (the session flips back to "online" on every WS resume) from
 * re-POSTing the same tokens over and over. Returns whether a call was made.
 */
export async function registerIfChanged(
  client: RemoteDesktopClient,
  reg: RemotePushRegistration,
): Promise<boolean> {
  const prev = sentByDevice.get(reg.deviceId) ?? emptyState();
  const next = mergeSent(prev, reg);
  if (sameState(prev, next)) return false;
  // Optimistically record the merged state so concurrent token callbacks don't
  // each re-send; roll back on failure so a later retry can succeed.
  sentByDevice.set(reg.deviceId, next);
  try {
    await client.registerPush(reg);
    return true;
  } catch (error) {
    sentByDevice.set(reg.deviceId, prev);
    console.warn("[push] registerPush failed (desktop may be on an older build)", error);
    return false;
  }
}

/**
 * Request push permission, register with APNs, and forward every token that
 * arrives to the desktop. Idempotent: safe to call again on reconnect — the
 * fingerprint guard suppresses duplicate upserts.
 */
export async function syncPushRegistration(
  client: RemoteDesktopClient,
  opts: SyncPushOptions,
): Promise<void> {
  const { deviceId } = opts;
  const platform = currentPlatform();
  const base: RemotePushRegistration = {
    deviceId,
    platform,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
  };

  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") {
      console.warn("[push] notification permission not granted:", permission.receive);
    } else {
      await PushNotifications.register();
    }
  } catch (error) {
    console.warn("[push] requestPermissions/register failed", error);
  }

  // Device token for ordinary alert pushes.
  attached.push(
    await PushNotifications.addListener("registration", (token) => {
      void registerIfChanged(client, { ...base, deviceToken: token.value });
    }),
  );
  attached.push(
    await PushNotifications.addListener("registrationError", (error) => {
      console.warn("[push] APNs registration error", error);
    }),
  );
  // The foregrounded app already shows its own notifications from the live WS
  // stream (see storeSync). Swallow foreground pushes so we don't double-notify.
  attached.push(
    await PushNotifications.addListener("pushNotificationReceived", () => {
      // no-op: suppress the OS banner while foregrounded
    }),
  );

  // Live Activities are iOS-only: Android carries just the FCM token above and
  // never touches the ActivityBridge (its schema rejects iOS-only fields).
  if (platform === "ios") {
    // Live Activity tokens (iOS 17.2+ push-to-start, plus per-activity updates).
    try {
      const supported = await ActivityBridge.isSupported();
      if (supported.pushToStart) {
        const { token } = await ActivityBridge.getPushToStartToken();
        if (token) {
          await registerIfChanged(client, { ...base, pushToStartToken: token });
        }
      }
    } catch (error) {
      console.warn("[push] push-to-start token unavailable", error);
    }

    attached.push(
      await ActivityBridge.addListener("activityTokenUpdate", ({ activityId, token }) => {
        void registerIfChanged(client, {
          ...base,
          activityTokens: { [activityId]: token },
        });
      }),
    );
  }
}

/** Drop this device's push registration on the desktop (disable / unpair). */
export async function unregisterPush(client: RemoteDesktopClient, deviceId: string): Promise<void> {
  sentByDevice.delete(deviceId);
  try {
    await client.unregisterPush(deviceId);
  } catch (error) {
    console.warn("[push] unregisterPush failed", error);
  }
}

/** Detach every push/activity listener (desktop switch or app teardown). */
export async function teardownPushListeners(): Promise<void> {
  const handles = attached;
  attached = [];
  await Promise.all(handles.map((handle) => handle.remove().catch(() => {})));
  try {
    await ActivityBridge.removeAllListeners();
  } catch {
    // best-effort
  }
}

/** Test-only reset of the fingerprint cache and listener registry. */
export function __resetPushRegistrationForTests(): void {
  sentByDevice.clear();
  attached = [];
}
