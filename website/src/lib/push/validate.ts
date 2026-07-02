/**
 * Strict, dependency-free validation of the /api/push request body. Pure: no
 * env, no I/O — so it can be exercised directly in a smoke test.
 */

export type PushType = "liveactivity" | "alert";
export type Platform = "ios" | "android";

export interface PushRequest {
  /** Target platform. Absent in a request body defaults to "ios" (back-compat). */
  platform: Platform;
  token: string;
  pushType: PushType;
  payload: Record<string, unknown>;
  priority?: 5 | 10;
  expiration?: number;
  collapseId?: string;
}

export type ParseResult = { ok: true; value: PushRequest } | { ok: false; error: string };

/** APNs device tokens are hex. Bound the length to reject obvious garbage. */
const TOKEN_PATTERN = /^[0-9a-fA-F]{32,200}$/;
/** FCM registration tokens are opaque non-hex strings — no whitespace, bounded. */
const FCM_TOKEN_PATTERN = /^\S+$/;
const MAX_FCM_TOKEN_LENGTH = 4096;
const MAX_PAYLOAD_BYTES = 4096;
const MAX_COLLAPSE_ID_BYTES = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePushRequest(raw: unknown): ParseResult {
  if (!isPlainObject(raw)) return { ok: false, error: "body must be a JSON object" };

  const { platform: platformRaw, token, pushType, payload, priority, expiration, collapseId } = raw;

  let platform: Platform;
  if (platformRaw === undefined || platformRaw === "ios") {
    platform = "ios";
  } else if (platformRaw === "android") {
    platform = "android";
  } else {
    return { ok: false, error: "platform must be 'ios' or 'android'" };
  }

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

  if (pushType !== "liveactivity" && pushType !== "alert") {
    return { ok: false, error: "pushType must be 'liveactivity' or 'alert'" };
  }

  if (!isPlainObject(payload)) {
    return { ok: false, error: "payload must be a JSON object" };
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` };
  }

  // Android is auto-rendered FCM notification messages only: there is no
  // Android Live Activity, and the notification block needs a non-empty
  // title/body. iOS payloads are opaque APNs envelopes and skip this.
  if (platform === "android") {
    if (pushType !== "alert") {
      return { ok: false, error: "pushType must be 'alert' on android" };
    }
    const { title, body } = payload as { title?: unknown; body?: unknown };
    if (typeof title !== "string" || title.length === 0) {
      return { ok: false, error: "payload.title must be a non-empty string" };
    }
    if (typeof body !== "string" || body.length === 0) {
      return { ok: false, error: "payload.body must be a non-empty string" };
    }
  }

  const result: PushRequest = { platform, token, pushType, payload };

  if (priority !== undefined) {
    if (priority !== 5 && priority !== 10) {
      return { ok: false, error: "priority must be 5 or 10" };
    }
    result.priority = priority;
  }

  if (expiration !== undefined) {
    if (typeof expiration !== "number" || !Number.isInteger(expiration) || expiration < 0) {
      return { ok: false, error: "expiration must be a non-negative integer" };
    }
    result.expiration = expiration;
  }

  if (collapseId !== undefined) {
    if (
      typeof collapseId !== "string" ||
      Buffer.byteLength(collapseId, "utf8") > MAX_COLLAPSE_ID_BYTES
    ) {
      return { ok: false, error: "collapseId must be a string <= 64 bytes" };
    }
    result.collapseId = collapseId;
  }

  return { ok: true, value: result };
}
