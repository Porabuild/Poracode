import { setBrowserWebPushActive } from "@/renderer/browserNotificationPermission";
import type { RemotePushClient, RemoteWebPushSubscription } from "@/shared/remote";
import { isStandaloneDisplay } from "../pwaInstall";
import { mobileRouterBasePath } from "../routing";

function decodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function sameApplicationServerKey(
  current: ArrayBuffer | null,
  expected: Uint8Array<ArrayBuffer>,
): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return (
    bytes.length === expected.length && bytes.every((value, index) => value === expected[index])
  );
}

function serializeSubscription(subscription: PushSubscription): RemoteWebPushSubscription {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Browser returned an incomplete Web Push subscription.");
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

const SUBSCRIBE_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isTransientSubscriptionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

async function subscribeWithPermissionRetry(
  registration: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (error) {
      const retryDelay = SUBSCRIBE_RETRY_DELAYS_MS[attempt];
      // WebKit can resolve Notification.requestPermission() before webpushd has
      // observed the new authorization. A short bounded retry bridges that OS
      // propagation window without retrying permanent denials or bad VAPID data.
      if (
        retryDelay === undefined ||
        Notification.permission !== "granted" ||
        !isTransientSubscriptionError(error)
      ) {
        throw error;
      }
      await delay(retryDelay);
    }
  }
}

export function supportsWebPushRegistration(): boolean {
  return (
    isStandaloneDisplay() &&
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof PushManager !== "undefined"
  );
}

/**
 * Register (or refresh) the installed PWA's Push API subscription against the
 * active paired desktop. Permission must already have been granted by a user
 * gesture; this function never opens the browser permission sheet itself.
 */
export async function syncWebPushRegistration(
  client: RemotePushClient,
  input: { readonly deviceId: string; readonly appVersion?: string },
): Promise<boolean> {
  if (!supportsWebPushRegistration() || Notification.permission !== "granted") {
    setBrowserWebPushActive(false);
    return false;
  }

  const [{ publicKey }, registration] = await Promise.all([
    client.webPushConfig(),
    navigator.serviceWorker.ready,
  ]);
  const applicationServerKey = decodeApplicationServerKey(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (
    subscription &&
    !sameApplicationServerKey(subscription.options.applicationServerKey, applicationServerKey)
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await subscribeWithPermissionRetry(registration, applicationServerKey);

  await client.registerPush({
    deviceId: input.deviceId,
    platform: "web",
    webPushSubscription: serializeSubscription(subscription),
    webAppBasePath: mobileRouterBasePath(window.location.pathname, import.meta.env.BASE_URL),
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
  });
  setBrowserWebPushActive(true);
  return true;
}

export async function unregisterWebPush(client: RemotePushClient, deviceId: string): Promise<void> {
  setBrowserWebPushActive(false);
  const subscription =
    "serviceWorker" in navigator
      ? await navigator.serviceWorker.ready
          .then((registration) => registration.pushManager.getSubscription())
          .catch(() => null)
      : null;
  await Promise.allSettled([
    client.unregisterPush(deviceId),
    subscription?.unsubscribe() ?? Promise.resolve(false),
  ]);
}
