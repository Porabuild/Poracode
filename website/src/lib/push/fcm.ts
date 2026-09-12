import type { FcmConfig } from "./config";
import { getAccessToken } from "./googleAuth";
import type { AndroidPushRequest } from "./validate";

/**
 * FCM HTTP v1 transport. Builds a **notification** message (the OS renders it
 * automatically). Routed clients also receive a four-field `data` map used to
 * select the exact native host registry entry. `collapse_key` plus the
 * per-notification `tag` use the same bounded composite identity, making
 * successive status pushes replace each other in the tray.
 * Forwards with an OAuth2 bearer and maps FCM's error taxonomy onto HTTP statuses
 * so the desktop's token-pruning logic stays uniform with the APNs path (notably
 * 410 → prune). Plain `fetch` over HTTP/1.1 is fine here; FCM v1 doesn't require
 * HTTP/2. The `getToken`/`fetchImpl` seams are injectable for testing without a
 * live connection.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const STATUS_CHANNEL_ID = "poracode_status_v1";
const ATTENTION_CHANNEL_ID = "poracode_attention_v1";

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
    data?: {
      version: string;
      clientConnectionId: string;
      desktopId: string;
      threadId: string;
    };
    android: {
      collapse_key?: string;
      priority: "HIGH" | "NORMAL";
      notification: {
        tag?: string;
        channel_id: string;
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
 * `silent` maps to the versioned quiet status channel and low notification
 * priority; all other notifications use the versioned attention channel.
 */
export function buildFcmMessage(req: AndroidPushRequest): FcmMessage {
  const { title, body, silent, version, clientConnectionId, desktopId, threadId } = req.payload as {
    title: string;
    body: string;
    silent?: boolean;
    version?: number;
    clientConnectionId?: string;
    desktopId?: string;
    threadId: string;
  };
  const data =
    version === 1 && clientConnectionId && desktopId
      ? { version: String(version), clientConnectionId, desktopId, threadId }
      : undefined;
  return {
    message: {
      token: req.token,
      notification: { title, body },
      ...(data ? { data } : {}),
      android: {
        ...(req.collapseId ? { collapse_key: req.collapseId } : {}),
        priority: req.priority === 10 ? "HIGH" : "NORMAL",
        notification: {
          ...(req.collapseId ? { tag: req.collapseId } : {}),
          channel_id: silent ? STATUS_CHANNEL_ID : ATTENTION_CHANNEL_ID,
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
