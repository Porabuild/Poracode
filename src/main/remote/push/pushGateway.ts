/**
 * Client for the hosted push gateway. The desktop cannot talk to APNs directly
 * (that needs the team's `.p8` auth key, which can't ship in the app), so a
 * small stateless gateway holds the key and forwards to `api.push.apple.com`.
 * We POST `{ token, pushType, payload, priority, ... }` to `<gatewayUrl>/api/push`
 * and relay the status so the caller can prune tokens on APNs `410`.
 */

/** Production gateway origin (co-hosted with the marketing site / PWA). The
 * canonical domain is `website/src/lib/seo.ts` `SITE_URL`. */
const DEFAULT_PUSH_GATEWAY_URL = "https://lightcodeapp.com";

/** Resolve the gateway origin: env override, else the production default. */
export function resolvePushGatewayUrl(): string {
  const fromEnv = process.env.LIGHTCODE_PUSH_GATEWAY_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_PUSH_GATEWAY_URL;
}

export interface SendPushInput {
  /** APNs token: device token (alert) or activity/push-to-start token (liveactivity). */
  readonly token: string;
  /**
   * Target platform. iOS payloads are raw APNs envelopes forwarded as-is;
   * Android payloads are the `{ title, body, threadId, silent? }` status shape
   * the gateway wraps into an FCM **notification** message. Sent explicitly on
   * every call (gateway defaults to `"ios"` server-side).
   */
  readonly platform: "ios" | "android";
  readonly pushType: "liveactivity" | "alert";
  /** JSON push payload: iOS `{ aps: { ... } }` or the Android status payload. */
  readonly payload: unknown;
  /** APNs `apns-priority` (5 = throttled, 10 = immediate). */
  readonly priority?: number;
  /** APNs `apns-collapse-id`, for coalescing. */
  readonly collapseId?: string;
  /** APNs `apns-expiration` (epoch seconds). */
  readonly expiration?: number;
}

export interface SendPushResult {
  readonly ok: boolean;
  /** HTTP status from the gateway (relaying APNs); `0` on a network error. */
  readonly status: number;
  /** APNs reported the token is no longer valid (410 Unregistered) — prune it. */
  readonly unregistered: boolean;
  readonly reason?: string;
}

export type SendPush = (input: SendPushInput) => Promise<SendPushResult>;

type FetchLike = (
  url: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number }>;

export interface CreatePushGatewayOptions {
  /** Gateway origin; defaults to {@link resolvePushGatewayUrl}. */
  readonly gatewayUrl?: string;
  /** Injectable fetch (tests); defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Per-request timeout; defaults to 10s. */
  readonly timeoutMs?: number;
  /** Structured-log sink for gateway failures. */
  readonly onError?: (error: unknown) => void;
}

const DEFAULT_GATEWAY_TIMEOUT_MS = 10_000;

/**
 * Builds a {@link SendPush} that posts to the gateway. It never throws: network
 * errors and non-OK statuses are returned as a {@link SendPushResult} so the
 * coordinator can decide whether to prune (410) or ignore (transient).
 */
export function createPushGateway(options: CreatePushGatewayOptions = {}): SendPush {
  const base = options.gatewayUrl ?? resolvePushGatewayUrl();
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
  const timeoutMs = options.timeoutMs ?? DEFAULT_GATEWAY_TIMEOUT_MS;
  const endpoint = new URL("/api/push", base.endsWith("/") ? base : `${base}/`).toString();

  return async (input: SendPushInput): Promise<SendPushResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: input.token,
          platform: input.platform,
          pushType: input.pushType,
          payload: input.payload,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.collapseId ? { collapseId: input.collapseId } : {}),
          ...(input.expiration !== undefined ? { expiration: input.expiration } : {}),
        }),
        signal: controller.signal,
      });
      return {
        ok: response.ok,
        status: response.status,
        unregistered: response.status === 410,
      };
    } catch (error) {
      options.onError?.(error);
      return {
        ok: false,
        status: 0,
        unregistered: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
