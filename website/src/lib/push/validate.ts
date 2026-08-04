/**
 * Strict, dependency-free validation of the /api/push request body. Pure: no
 * env, no I/O — so it can be exercised directly in a smoke test.
 */

export type PushType = "liveactivity" | "alert";
export type Platform = "ios" | "android" | "web";

interface PushRequestBase {
  pushType: PushType;
  payload: Record<string, unknown>;
  priority?: 5 | 10;
  expiration?: number;
  collapseId?: string;
}

export interface IosPushRequest extends PushRequestBase {
  platform: "ios";
  token: string;
}

export interface AndroidPushRequest extends PushRequestBase {
  platform: "android";
  token: string;
  pushType: "alert";
}

export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface WebPushRequest extends PushRequestBase {
  platform: "web";
  subscription: WebPushSubscription;
  pushType: "alert";
}

export type PushRequest = IosPushRequest | AndroidPushRequest | WebPushRequest;

export type ParseResult = { ok: true; value: PushRequest } | { ok: false; error: string };

/** APNs device tokens are hex. Bound the length to reject obvious garbage. */
const TOKEN_PATTERN = /^[0-9a-fA-F]{32,200}$/;
/** FCM registration tokens are opaque non-hex strings — no whitespace, bounded. */
const FCM_TOKEN_PATTERN = /^\S+$/;
const MAX_FCM_TOKEN_LENGTH = 4096;
const WEB_PUSH_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_WEB_PUSH_ENDPOINT_LENGTH = 4096;
const MAX_PAYLOAD_BYTES = 4096;
const MAX_COLLAPSE_ID_BYTES = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedWebPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "web.push.apple.com" ||
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

function parseWebPushSubscription(value: unknown): WebPushSubscription | string {
  if (!isPlainObject(value)) return "subscription must be a JSON object";
  const { endpoint, expirationTime, keys } = value;
  if (
    typeof endpoint !== "string" ||
    endpoint.length > MAX_WEB_PUSH_ENDPOINT_LENGTH ||
    !isAllowedWebPushEndpoint(endpoint)
  ) {
    return "subscription.endpoint must be a supported HTTPS push-service URL";
  }
  if (
    expirationTime !== null &&
    (typeof expirationTime !== "number" || !Number.isInteger(expirationTime) || expirationTime < 0)
  ) {
    return "subscription.expirationTime must be null or a non-negative integer";
  }
  if (!isPlainObject(keys)) return "subscription.keys must be a JSON object";
  const { p256dh, auth } = keys;
  if (
    typeof p256dh !== "string" ||
    p256dh.length === 0 ||
    p256dh.length > 256 ||
    !WEB_PUSH_KEY_PATTERN.test(p256dh)
  ) {
    return "subscription.keys.p256dh must be base64url";
  }
  if (
    typeof auth !== "string" ||
    auth.length === 0 ||
    auth.length > 256 ||
    !WEB_PUSH_KEY_PATTERN.test(auth)
  ) {
    return "subscription.keys.auth must be base64url";
  }
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

export function parsePushRequest(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: "body must be a JSON object" };

  const {
    platform: platformRaw,
    token,
    subscription,
    pushType,
    payload,
    priority,
    expiration,
    collapseId,
  } = raw;

  let platform: Platform;
  if (platformRaw === undefined || platformRaw === "ios") {
    platform = "ios";
  } else if (platformRaw === "android") {
    platform = "android";
  } else if (platformRaw === "web") {
    platform = "web";
  } else {
    return { ok: false, error: "platform must be 'ios', 'android', or 'web'" };
  }

  let webSubscription: WebPushSubscription | undefined;
  if (platform === "web") {
    const parsedSubscription = parseWebPushSubscription(subscription);
    if (typeof parsedSubscription === "string") {
      return { ok: false, error: parsedSubscription };
    }
    webSubscription = parsedSubscription;
  } else {
    if (typeof token !== "string") {
      return { ok: false, error: "token must be a string" };
    }
    if (platform === "ios") {
      if (!TOKEN_PATTERN.test(token)) {
        return { ok: false, error: "token must be a hex string" };
      }
    } else if (!FCM_TOKEN_PATTERN.test(token) || token.length > MAX_FCM_TOKEN_LENGTH) {
      return { ok: false, error: "token must be a non-empty string without whitespace" };
    }
  }

  if (pushType !== "liveactivity" && pushType !== "alert") {
    return { ok: false, error: "pushType must be 'liveactivity' or 'alert'" };
  }

  if (!isPlainObject(payload)) {
    return { ok: false, error: "payload must be a JSON object" };
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` };
  }

  // Android and web pushes both carry an explicit user-visible notification.
  // iOS payloads are opaque APNs envelopes and skip this shape check.
  if (platform === "android" || platform === "web") {
    if (pushType !== "alert") {
      return { ok: false, error: `pushType must be 'alert' on ${platform}` };
    }
    const { title, body, threadId, url } = payload as {
      title?: unknown;
      body?: unknown;
      threadId?: unknown;
      url?: unknown;
    };
    if (typeof title !== "string" || title.length === 0) {
      return { ok: false, error: "payload.title must be a non-empty string" };
    }
    if (typeof body !== "string" || body.length === 0) {
      return { ok: false, error: "payload.body must be a non-empty string" };
    }
    if (platform === "web") {
      if (typeof threadId !== "string" || threadId.length === 0) {
        return { ok: false, error: "payload.threadId must be a non-empty string" };
      }
      if (typeof url !== "string" || !/^\/(?!\/)[^?#]*$/.test(url)) {
        return { ok: false, error: "payload.url must be a same-origin absolute path" };
      }
    }
  }

  const options: {
    priority?: 5 | 10;
    expiration?: number;
    collapseId?: string;
  } = {};

  if (priority !== undefined) {
    if (priority !== 5 && priority !== 10) {
      return { ok: false, error: "priority must be 5 or 10" };
    }
    options.priority = priority;
  }

  if (expiration !== undefined) {
    if (typeof expiration !== "number" || !Number.isInteger(expiration) || expiration < 0) {
      return { ok: false, error: "expiration must be a non-negative integer" };
    }
    options.expiration = expiration;
  }

  if (collapseId !== undefined) {
    if (
      typeof collapseId !== "string" ||
      Buffer.byteLength(collapseId, "utf8") > MAX_COLLAPSE_ID_BYTES
    ) {
      return { ok: false, error: "collapseId must be a string <= 64 bytes" };
    }
    options.collapseId = collapseId;
  }

  if (platform === "web") {
    return {
      ok: true,
      value: {
        platform,
        subscription: webSubscription!,
        pushType: "alert",
        payload,
        ...options,
      },
    };
  }
  return {
    ok: true,
    value: {
      platform,
      token: token as string,
      pushType: pushType as PushType,
      payload,
      ...options,
    } as IosPushRequest | AndroidPushRequest,
  };
}
