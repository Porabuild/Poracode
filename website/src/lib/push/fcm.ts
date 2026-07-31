import type { FcmConfig } from "./config";
import { getAccessToken } from "./googleAuth";
import type { AndroidPushRequest } from "./validate";

/**
 * FCM HTTP v1 transport. Builds a **notification** message (the OS renders it
 * automatically; Capacitor's push plugin receives it in-app when foregrounded,
 * so there's no double-notify and no native code). No `data` field. `collapse_key`
 * plus the per-notification `tag` (both = threadId) make successive status pushes
 * for a thread REPLACE each other in the tray, approximating a status card.
 * Forwards with an OAuth2 bearer and maps FCM's error taxonomy onto HTTP statuses
 * so the desktop's token-pruning logic stays uniform with the APNs path (notably
 * 410 → prune). Plain `fetch` over HTTP/1.1 is fine here; FCM v1 doesn't require
 * HTTP/2. The `getToken`/`fetchImpl` seams are injectable for testing without a
 * live connection.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export interface FcmResult {
  status: number;
  messageId?: string;
  reason?: string;
}

/** Thrown for gateway-side failures (token exchange, network, timeout) → 502. */
export class FcmUnreachableError extends Error {}

export interface FcmMessage {
  message: {
    token: string;
    notification: { title: string; body: string };
    android: {
      collapse_key?: string;
      priority: "HIGH" | "NORMAL";
      notification: {
        tag?: string;
        notification_priority: "PRIORITY_LOW" | "PRIORITY_DEFAULT";
      };
    };
  };
}

/**
 * Build the v1 notification-message body. The title/body come straight from the
 * validated Android payload. FCM `android.priority` is HIGH only for priority 10
 * (matching the contract); 5/undefined map to NORMAL. `collapse_key` + `tag`
 * (both = collapseId) coalesce/replace a thread's successive status pushes.
 * `silent` maps to a low notification priority (a quiet tray update).
 */
export function buildFcmMessage(req: AndroidPushRequest): FcmMessage {
  const { title, body, silent } = req.payload as {
    title: string;
    body: string;
    silent?: boolean;
  };
  return {
    message: {
      token: req.token,
      notification: { title, body },
      android: {
        ...(req.collapseId ? { collapse_key: req.collapseId } : {}),
        priority: req.priority === 10 ? "HIGH" : "NORMAL",
        notification: {
          ...(req.collapseId ? { tag: req.collapseId } : {}),
          notification_priority: silent ? "PRIORITY_LOW" : "PRIORITY_DEFAULT",
        },
      },
    },
  };
}

interface FcmErrorInfo {
  /** Canonical gRPC status, e.g. "NOT_FOUND", "INVALID_ARGUMENT". */
  status?: string;
  /** FCM-specific detail code, e.g. "UNREGISTERED", "QUOTA_EXCEEDED". */
  errorCode?: string;
}

/** Parse an FCM v1 error envelope: { error: { status, details: [{ errorCode }] } }. */
export function parseFcmError(body: string): FcmErrorInfo {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as {
      error?: { status?: unknown; details?: Array<{ errorCode?: unknown }> };
    };
    const status = typeof parsed.error?.status === "string" ? parsed.error.status : undefined;
    let errorCode: string | undefined;
    for (const detail of parsed.error?.details ?? []) {
      if (typeof detail?.errorCode === "string") {
        errorCode = detail.errorCode;
        break;
      }
    }
    return { ...(status ? { status } : {}), ...(errorCode ? { errorCode } : {}) };
  } catch {
    return {};
  }
}

/** Parse the message name from a successful send: { name: "projects/…/messages/ID" }. */
export function parseFcmMessageId(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map an FCM error HTTP status + body onto the result the route relays. 410 with
 * reason "Unregistered" is the pruning signal the desktop keys on; other codes
 * pass through as their nearest HTTP equivalent.
 */
export function mapFcmError(httpStatus: number, body: string): FcmResult {
  const { status, errorCode } = parseFcmError(body);
  const reason = errorCode ?? status;
  const withReason = (mapped: number): FcmResult => ({
    status: mapped,
    ...(reason ? { reason } : {}),
  });

  if (httpStatus === 404 || errorCode === "UNREGISTERED" || status === "NOT_FOUND") {
    return { status: 410, reason: "Unregistered" };
  }
  if (errorCode === "INVALID_ARGUMENT" || status === "INVALID_ARGUMENT") {
    return withReason(400);
  }
  if (errorCode === "QUOTA_EXCEEDED" || status === "RESOURCE_EXHAUSTED") {
    return withReason(429);
  }
  if (
    errorCode === "UNAVAILABLE" ||
    status === "UNAVAILABLE" ||
    errorCode === "INTERNAL" ||
    status === "INTERNAL"
  ) {
    return withReason(502);
  }
  // Unknown FCM failure: relay the HTTP status, defaulting to a gateway error.
  return withReason(httpStatus || 502);
}

export interface SendToFcmDeps {
  getToken?: (config: FcmConfig) => Promise<string>;
  fetchImpl?: typeof fetch;
}

/**
 * Forward a validated push to FCM HTTP v1 and relay its result. Token-exchange
 * or network failures surface as {@link FcmUnreachableError} (→ 502).
 */
export async function sendToFcm(
  config: FcmConfig,
  req: AndroidPushRequest,
  deps: SendToFcmDeps = {},
): Promise<FcmResult> {
  const getToken = deps.getToken ?? getAccessToken;
  const fetchImpl = deps.fetchImpl ?? fetch;

  let accessToken: string;
  try {
    accessToken = await getToken(config);
  } catch (err) {
    throw new FcmUnreachableError(err instanceof Error ? err.message : "token exchange failed");
  }

  const url = `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`;
  const message = buildFcmMessage(req);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } catch {
    throw new FcmUnreachableError("FCM request failed");
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (response.ok) {
    const messageId = parseFcmMessageId(text);
    return { status: 200, ...(messageId ? { messageId } : {}) };
  }
  return mapFcmError(response.status, text);
}
