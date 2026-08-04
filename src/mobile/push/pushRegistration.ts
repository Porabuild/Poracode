import { registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { ActivityBridge } from "@poracode/activity-bridge";
import type { RemotePushClient, RemotePushRegistration } from "@/shared/remote";

/**
 * Push token registration for the native app.
 *
 * iOS: collects the ordinary APNs device token (via
 * `@capacitor/push-notifications`), plus the Live Activity push-to-start token
 * and per-activity update tokens (via `@poracode/activity-bridge`).
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

/** App-local Android plugin (android/app/.../PushSupportPlugin.java): reports
 * whether this build carries Firebase config. iOS has no equivalent — APNs
 * needs no build-time config beyond entitlements. */
const PushSupport = registerPlugin<{ isConfigured(): Promise<{ configured: boolean }> }>(
  "PushSupport",
);

/**
 * Android push rides on FCM, which the google-services Gradle plugin only
 * wires up when android/app/google-services.json is present — builds without
 * it are supported (app-links-only / dev) with push off. In such a build,
 * `PushNotifications.register()` throws on the native bridge thread
 * ("Default FirebaseApp is not initialized") and kills the process before any
 * JS catch can run, so ask the shell first and stay inert when FCM is absent.
 */
async function isPushSupported(): Promise<boolean> {
  if (currentPlatform() !== "android") return true;
  try {
    const { configured } = await PushSupport.isConfigured();
    return configured;
  } catch {
    // Shell without the PushSupport plugin — can't verify, so don't risk the
    // native crash.
    return false;
  }
}

export interface SyncPushOptions {
  readonly deviceId: string;
  readonly appVersion?: string;
  /** True once the effect that started this sync has been torn down (desktop
   * switch / unmount). Checked before attaching each listener so a sync that
   * resumes after cleanup can't orphan listeners bound to a stale client. */
  readonly shouldCancel?: () => boolean;
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
  client: RemotePushClient,
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
  client: RemotePushClient,
  opts: SyncPushOptions,
): Promise<void> {
  const { deviceId } = opts;
  const isCancelled = () => opts.shouldCancel?.() ?? false;
  const platform = currentPlatform();
  if (!(await isPushSupported())) {
    console.warn("[push] FCM not configured in this build; skipping push registration");
    return;
  }
  const base: RemotePushRegistration = {
    deviceId,
    platform,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
  };

  // Attach a listener only if the sync hasn't been torn down while awaiting;
  // otherwise remove it immediately so it can't fire against a stale client or
  // leak into the reset `attached` registry.
  async function attach(handlePromise: Promise<{ remove: () => Promise<void> }>): Promise<boolean> {
    const handle = await handlePromise;
    if (isCancelled()) {
      await handle.remove().catch(() => {});
      return false;
    }
    attached.push(handle);
    return true;
  }

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
  if (isCancelled()) return;

  // Device token for ordinary alert pushes.
  if (
    !(await attach(
      PushNotifications.addListener("registration", (token) => {
        void registerIfChanged(client, { ...base, deviceToken: token.value });
      }),
    ))
  ) {
    return;
  }
  if (
    !(await attach(
      PushNotifications.addListener("registrationError", (error) => {
        console.warn("[push] APNs registration error", error);
      }),
    ))
  ) {
    return;
  }
  // The foregrounded app already shows its own notifications from the live WS
  // stream (see storeSync). Swallow foreground pushes so we don't double-notify.
  if (
    !(await attach(
      PushNotifications.addListener("pushNotificationReceived", () => {
        // no-op: suppress the OS banner while foregrounded
      }),
    ))
  ) {
    return;
  }

  // Live Activities are iOS-only: Android carries just the FCM token above and
  // never touches the ActivityBridge (its schema rejects iOS-only fields).
  if (platform === "ios") {
    // Live Activity tokens (iOS 17.2+ push-to-start, plus per-activity updates).
    try {
      const supported = await ActivityBridge.isSupported();
      if (supported.pushToStart) {
        const { token } = await ActivityBridge.getPushToStartToken();
        if (token && !isCancelled()) {
          await registerIfChanged(client, { ...base, pushToStartToken: token });
        }
      }
    } catch (error) {
      console.warn("[push] push-to-start token unavailable", error);
    }

    await attach(
      ActivityBridge.addListener("activityTokenUpdate", ({ activityId, token }) => {
        void registerIfChanged(client, {
          ...base,
          activityTokens: { [activityId]: token },
        });
      }),
    );
  }
}

/** Drop this device's push registration on the desktop (disable / unpair). */
export async function unregisterPush(client: RemotePushClient, deviceId: string): Promise<void> {
  sentByDevice.delete(deviceId);
  try {
    await client.unregisterPush(deviceId);
  } catch (error) {
    console.warn("[push] unregisterPush failed", error);
  }
}

export interface TeardownPushListenersOptions {
  /** Clear the sent-token fingerprint too (desktop identity change / disable). */
  readonly resetSentState?: boolean;
}

/** Detach every push/activity listener. */
export async function teardownPushListeners(
  options: TeardownPushListenersOptions = {},
): Promise<void> {
  const handles = attached;
  attached = [];
  if (options.resetSentState) {
    // The fingerprint cache is keyed by the stable deviceId, so a switch/re-pair
    // to a DIFFERENT desktop must clear it or the new desktop's client would
    // treat the previous desktop's tokens as already sent. Plain reconnects
    // only detach listeners and intentionally keep the fingerprint.
    sentByDevice.clear();
  }
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
