/**
 * Client for the hosted push gateway. The desktop cannot talk to APNs directly
 * (that needs the team's `.p8` auth key, which can't ship in the app), so a
 * small stateless gateway holds provider credentials and forwards to APNs, FCM,
 * or a standards-based Web Push service. We relay provider status so callers
 * can prune expired registrations.
 */

import type { RemoteWebPushSubscription } from "@/shared/remote";
import { assertIOSPushPayload, type IOSPushPayload } from "./payloads";

/** Production gateway origin (co-hosted with the marketing site / PWA). The
 * canonical domain is `website/src/lib/seo.ts` `SITE_URL`. */
const DEFAULT_PUSH_GATEWAY_URL = "https://poracode.com";

/** Resolve the gateway origin: env override, else the production default. */
export function resolvePushGatewayUrl(): string {
  const fromEnv = process.env.PORACODE_PUSH_GATEWAY_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_PUSH_GATEWAY_URL;
}

interface NativeSendPushInputBase {
  /** APNs token: device token (alert) or activity/push-to-start token (liveactivity). */
  readonly token: string;
  /**
   * Target platform. iOS payloads are raw APNs envelopes forwarded as-is;
   * Android payloads are a status shape; routing-v1 registrations add
   * `{ version, clientConnectionId, desktopId }`. The gateway wraps it into an
   * FCM notification plus routing data. Sent explicitly on every call.
   */
  readonly pushType: "liveactivity" | "alert";
  /** APNs `apns-priority` (5 = throttled, 10 = immediate). */
  readonly priority?: number;
  /** APNs `apns-collapse-id`, for coalescing. */
  readonly collapseId?: string;
  /** APNs `apns-expiration` (epoch seconds). */
  readonly expiration?: number;
}

interface IOSSendPushInput extends NativeSendPushInputBase {
  readonly platform: "ios";
  readonly payload: IOSPushPayload;
}

interface AndroidSendPushInput extends NativeSendPushInputBase {
  readonly platform: "android";
  readonly payload: unknown;
}

interface WebSendPushInput {
  readonly platform: "web";
  readonly subscription: RemoteWebPushSubscription;
  readonly pushType: "alert";
  /** `{ title, body, threadId, url }`, displayed by the PWA service worker. */
  readonly payload: unknown;
  readonly priority?: number;
  readonly collapseId?: string;
  readonly expiration?: number;
}

export type SendPushInput = IOSSendPushInput | AndroidSendPushInput | WebSendPushInput;

export interface SendPushResult {
  readonly ok: boolean;
  /** HTTP status from the gateway/provider; `0` on a network error. */
  readonly status: number;
  /** The provider reported the registration is gone (404/410) — prune it. */
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
) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;

export interface CreatePushGatewayOptions {
  /** Gateway origin; defaults to {@link resolvePushGatewayUrl}. */
  readonly gatewayUrl?: string;
  /** Injectable fetch (tests); defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Per-request timeout; defaults to 10s. */
  readonly timeoutMs?: number;
  /**
   * Non-transient diagnostic sink. Receives only bounded, privacy-safe
   * malformed-response failures; raw transport errors, transient operational
   * outcomes, and request data are never forwarded.
   */
  readonly onError?: (error: unknown) => void;
  /** Injectable clock and reporting window for deterministic tests. */
  readonly now?: () => number;
  readonly operationalReportIntervalMs?: number;
}

const DEFAULT_GATEWAY_TIMEOUT_MS = 10_000;
const DEFAULT_OPERATIONAL_REPORT_INTERVAL_MS = 15 * 60 * 1_000;
const TRANSIENT_GATEWAY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type PushGatewayOperation = "send" | "resolve-web-key";
type PushGatewayOutcome = "network-error" | "timeout" | "transient-response" | "invalid-response";

class PushGatewayOperationalError extends Error {
  constructor(
    readonly operation: PushGatewayOperation,
    readonly outcome: PushGatewayOutcome,
    readonly platform: SendPushInput["platform"] | "none",
    readonly status: number,
  ) {
    const transient = outcome !== "invalid-response";
    super(`Remote push ${operation} ${transient ? "warning" : "failed"}: ${outcome}.`);
    this.name = transient ? "PushGatewayOperationalWarning" : "PushGatewayDiagnosticError";
  }
}

function classifyTransportOutcome(error: unknown): PushGatewayOutcome {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code.toUpperCase()
      : null;
  if (
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    code === "ETIMEDOUT"
  ) {
    return "timeout";
  }
  return "network-error";
}

function createOperationalReporter(options: CreatePushGatewayOptions) {
  const lastReports = new Map<string, number>();
  const now = options.now ?? Date.now;
  const interval = options.operationalReportIntervalMs ?? DEFAULT_OPERATIONAL_REPORT_INTERVAL_MS;
  return (
    operation: PushGatewayOperation,
    outcome: PushGatewayOutcome,
    platform: SendPushInput["platform"] | "none",
    status: number,
  ): void => {
    const key = `${operation}:${outcome}:${platform}:${status}`;
    const timestamp = now();
    const lastReport = lastReports.get(key);
    if (lastReport !== undefined && timestamp - lastReport < interval) return;
    lastReports.set(key, timestamp);
    const diagnostic = new PushGatewayOperationalError(operation, outcome, platform, status);
    if (outcome === "invalid-response") {
      options.onError?.(diagnostic);
      return;
    }
    console.warn(`[poracode] ${diagnostic.message}`);
  };
}

interface GatewayTransport {
  /** Absolute `/api/push` URL on the resolved gateway origin. */
  readonly endpoint: string;
  /** Run one request against the gateway, aborting it after the timeout. */
  request(init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;
}

/**
 * Resolve the gateway origin, fetch impl, and timeout once, and expose a
 * timeout-guarded request runner. Shared by {@link createPushGateway} and
 * {@link createWebPushPublicKeyResolver} so the `/api/push` URL and the
 * abort/timeout dance have one source of truth. `/api/push` is root-absolute,
 * so only `base`'s origin matters (no trailing-slash fixup needed).
 */
function createGatewayTransport(options: CreatePushGatewayOptions): GatewayTransport {
  const base = options.gatewayUrl ?? resolvePushGatewayUrl();
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
  const timeoutMs = options.timeoutMs ?? DEFAULT_GATEWAY_TIMEOUT_MS;
  const endpoint = new URL("/api/push", base).toString();
  return {
    endpoint,
    async request(init) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await doFetch(endpoint, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Builds a {@link SendPush} that posts to the gateway. It never throws: network
 * errors and non-OK statuses are returned as a {@link SendPushResult} so the
 * coordinator can decide whether to prune (410) or ignore (transient).
 */
export function createPushGateway(options: CreatePushGatewayOptions = {}): SendPush {
  const transport = createGatewayTransport(options);
  const reportOperationalIssue = createOperationalReporter(options);
  return async (input: SendPushInput): Promise<SendPushResult> => {
    if (input.platform === "ios") {
      try {
        assertIOSPushPayload(input.payload, input.pushType);
      } catch {
        return {
          ok: false,
          status: 0,
          unregistered: false,
          reason: "Invalid iOS push payload.",
        };
      }
    }
    try {
      const response = await transport.request({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(input.platform === "web"
            ? { subscription: input.subscription }
            : { token: input.token }),
          platform: input.platform,
          pushType: input.pushType,
          payload: input.payload,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.collapseId ? { collapseId: input.collapseId } : {}),
          ...(input.expiration !== undefined ? { expiration: input.expiration } : {}),
        }),
      });
      if (TRANSIENT_GATEWAY_STATUSES.has(response.status)) {
        reportOperationalIssue("send", "transient-response", input.platform, response.status);
      } else if (!response.ok && response.status !== 404 && response.status !== 410) {
        reportOperationalIssue("send", "invalid-response", input.platform, response.status);
      }
      return {
        ok: response.ok,
        status: response.status,
        unregistered:
          response.status === 410 || (input.platform === "web" && response.status === 404),
      };
    } catch (error) {
      const outcome = classifyTransportOutcome(error);
      reportOperationalIssue("send", outcome, input.platform, 0);
      return {
        ok: false,
        status: 0,
        unregistered: false,
        reason: outcome === "timeout" ? "Gateway request timed out." : "Gateway request failed.",
      };
    }
  };
}

export type ResolveWebPushPublicKey = () => Promise<string>;

/**
 * Resolves the public VAPID application-server key from the hosted gateway.
 * The host proxies this public value to authenticated browser clients so
 * hosted, relayed, and local installations use one subscription key.
 */
export function createWebPushPublicKeyResolver(
  options: CreatePushGatewayOptions = {},
): ResolveWebPushPublicKey {
  const transport = createGatewayTransport(options);
  const reportOperationalIssue = createOperationalReporter(options);
  const fetchPublicKey = async (): Promise<string> => {
    try {
      const response = await transport.request({ method: "GET" });
      if (!response.ok || !response.json) {
        reportOperationalIssue(
          "resolve-web-key",
          TRANSIENT_GATEWAY_STATUSES.has(response.status)
            ? "transient-response"
            : "invalid-response",
          "web",
          response.status,
        );
        throw new Error(`Web Push config request failed with status ${response.status}.`);
      }
      const body = (await response.json()) as { publicKey?: unknown };
      if (typeof body.publicKey !== "string" || body.publicKey.length === 0) {
        reportOperationalIssue("resolve-web-key", "invalid-response", "web", response.status);
        throw new Error("Web Push config response did not include a public key.");
      }
      return body.publicKey;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (!error.message.startsWith("Web Push config request failed") &&
          error.message !== "Web Push config response did not include a public key.")
      ) {
        reportOperationalIssue("resolve-web-key", classifyTransportOutcome(error), "web", 0);
      }
      throw error;
    }
  };

  // The public VAPID key is constant for the gateway, but the config endpoint
  // is hit on every `/api/push/config` request and on every client reconnect.
  // Cache the resolved (or in-flight) promise so those collapse into one fetch;
  // drop it on failure so a transient error still retries on the next call.
  let cached: Promise<string> | null = null;
  return () => {
    if (!cached) {
      cached = fetchPublicKey().catch((error) => {
        cached = null;
        throw error;
      });
    }
    return cached;
  };
}
