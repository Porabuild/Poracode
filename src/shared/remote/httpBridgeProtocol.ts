/**
 * Versioned frame contract for the off-main remote HTTP bridge (V4 F8).
 *
 * The bridge is one lazily started Electron utility process that owns client
 * outbound HTTP. Main is the control plane only: it authenticates the calling
 * window, admits the request, mints a `MessageChannelMain` pair, and hands one
 * port to the utility process and the other to the requesting renderer. The
 * renderer and the utility then exchange request bodies and response chunks
 * directly over that port; no body byte ever traverses main.
 *
 * Two independent message surfaces share this contract:
 * - `RemoteHttpBridgeParentMessage`: main -> utility control messages (open,
 *   abort, stats). One per request or lifecycle action, never body bytes.
 * - `RemoteHttpBridgePortUpstream` / `RemoteHttpBridgePortDownstream`: the
 *   per-request port frames (upload, credit, head, chunk, end, error).
 *
 * This module deliberately has no zod dependency: the sandboxed preload
 * imports the port-envelope guard, and the utility's frame validation must
 * stay cheap. Main-side IPC payload validation lives in
 * `httpBridgeValidation.ts`.
 *
 * Version rule: the frame set is a wire boundary between the renderer bundle
 * and the utility entry in the packaged app. A shape/meaning change requires a
 * `REMOTE_HTTP_BRIDGE_VERSION` bump and a matching facade version decision in
 * `.agents/docs/versioning.md`.
 *
 * Version 2 adds response metadata budgets separate from the (stricter)
 * request metadata budget and the `upload-grant` downstream frame that gives
 * uploads an admission/credit handshake, so a version-1 utility or renderer
 * must not be paired with a version-2 peer.
 */
/** Version 3 binds the optional certificate leaf pin to each request TLS connection. */
export const REMOTE_HTTP_BRIDGE_VERSION = 3 as const;

/** Bounded response body, matching the pre-F8 main-buffered transport limit. */
export const REMOTE_HTTP_MAX_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;
/** Whole-request deadline (dispatch through terminal frame), matching pre-F8. */
export const REMOTE_HTTP_REQUEST_TIMEOUT_MS = 60_000;
/** Per-request upload body cap. The server's 20 MiB attachment cap is lower. */
export const REMOTE_HTTP_MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
/**
 * Aggregate utility-side upload account across active requests: declared
 * length is reserved at admission and moves to received/retained bytes as
 * chunks arrive, so `reservedUploadBytes + retainedUploadBytes` never exceeds
 * this budget. Upload bytes must stay replayable so a 307/308 redirect can
 * resend them, so the utility retains each accepted request body until that
 * request settles. A request whose declared body would exceed the remaining
 * budget is rejected before it may send any payload.
 */
export const REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES = 96 * 1024 * 1024;
/**
 * Response credit ceiling per request: the renderer grants at most this much
 * outstanding credit, and the utility clamps its accumulated credit to the same
 * value, so one consumer pull can never authorize a larger response burst.
 */
export const REMOTE_HTTP_RESPONSE_CREDIT_BYTES = 1024 * 1024;
/** Upload frames are bounded so one message cannot be an unbounded allocation. */
export const REMOTE_HTTP_UPLOAD_CHUNK_BYTES = 1024 * 1024;
/**
 * Upload credit the utility grants per request: the renderer may have at most
 * this many unacknowledged upload bytes in transit. The utility grants the
 * initial window once it has reserved the declared length, then grants each
 * accepted chunk back, so a paused utility can never accumulate a full body in
 * the port queue and a slow upload cannot grow a sibling's backlog.
 */
export const REMOTE_HTTP_UPLOAD_CREDIT_BYTES = 1024 * 1024;
/** Global and per-window active-request admission caps. */
export const REMOTE_HTTP_MAX_ACTIVE_REQUESTS = 128;
export const REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW = 64;
/** Request metadata bounds: admission is bounded as strictly as data. */
export const REMOTE_HTTP_MAX_URL_LENGTH = 4096;
export const REMOTE_HTTP_MAX_HEADER_COUNT = 64;
export const REMOTE_HTTP_MAX_HEADER_NAME_LENGTH = 256;
export const REMOTE_HTTP_MAX_HEADER_VALUE_LENGTH = 8192;
export const REMOTE_HTTP_MAX_HEADER_TOTAL_BYTES = 32 * 1024;
export const REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH = 512;
/**
 * Response metadata bounds, deliberately separate from the request budget.
 * Request headers are renderer-supplied and must stay tightly bounded;
 * response headers come from the remote server and are bounded by Node's HTTP
 * parser (16 KiB header block by default). These response bounds sit above
 * that parser cap so a legal response is never rejected, while still keeping
 * the `head` frame finite: a single response value cannot exceed the parser
 * block, and the worst legal block cannot produce a larger pair count.
 */
export const REMOTE_HTTP_MAX_RESPONSE_HEADER_COUNT = 4096;
export const REMOTE_HTTP_MAX_RESPONSE_HEADER_NAME_LENGTH = 1024;
export const REMOTE_HTTP_MAX_RESPONSE_HEADER_VALUE_LENGTH = 16 * 1024;
export const REMOTE_HTTP_MAX_RESPONSE_HEADER_TOTAL_BYTES = 64 * 1024;
export const REMOTE_HTTP_MAX_RESPONSE_STATUS_TEXT_LENGTH = 1024;

/** Delay before a terminal request port is force-closed if the renderer kept it. */
export const REMOTE_HTTP_BRIDGE_PORT_LINGER_MS = 5000;

/** Channel used by `webContents.postMessage` to deliver a request port. */
export const REMOTE_HTTP_BRIDGE_PORT_CHANNEL = "poracode.remoteHttpBridge.port" as const;

export const REMOTE_HTTP_BRIDGE_METHODS = ["GET", "POST", "HEAD", "DELETE"] as const;
export type RemoteHttpBridgeMethod = (typeof REMOTE_HTTP_BRIDGE_METHODS)[number];

export const REMOTE_HTTP_BRIDGE_ERROR_CODES = [
  "cancelled",
  "timeout",
  "too-large",
  "network",
  "protocol",
  "overloaded",
  "certificate_fingerprint_mismatch",
] as const;
export type RemoteHttpBridgeErrorCode = (typeof REMOTE_HTTP_BRIDGE_ERROR_CODES)[number];

export type RemoteHttpBridgeOutcome = "completed" | "failed" | "cancelled";

export type RemoteHttpBridgeHeaders = Readonly<Record<string, string>>;

/** Renderer -> main admission metadata. Never carries body bytes. */
export interface RemoteHttpBridgeOpenRequest {
  readonly requestId: string;
  readonly url: string;
  readonly method: RemoteHttpBridgeMethod;
  readonly headers: RemoteHttpBridgeHeaders;
  readonly hasBody: boolean;
  readonly bodyBytes: number;
  readonly certFingerprint?: string | null | undefined;
}

/** Main -> renderer admission result; pairs with the generation-tagged port. */
export interface RemoteHttpBridgeOpenResult {
  readonly generation: number;
}

export interface RemoteHttpBridgeCancelRequest {
  readonly requestId: string;
}

/** Main -> utility open descriptor, delivered with the utility-side port. */
export interface RemoteHttpBridgeOpenDescriptor {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "open";
  readonly generation: number;
  readonly senderId: number;
  readonly requestId: string;
  readonly url: string;
  readonly method: RemoteHttpBridgeMethod;
  readonly headers: RemoteHttpBridgeHeaders;
  readonly hasBody: boolean;
  readonly bodyBytes: number;
  readonly certFingerprint?: string | null | undefined;
}

export interface RemoteHttpBridgeAbortWindowMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "abort-window";
  readonly generation: number;
  readonly senderId: number;
}

export interface RemoteHttpBridgeAbortAllMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "abort-all";
  readonly generation: number;
}

export interface RemoteHttpBridgeStatsQueryMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "stats-query";
  readonly generation: number;
  readonly queryId: number;
}

/**
 * Main-side cancellation for the window before a renderer has its port (or as
 * a fallback). Once the port is attached the renderer cancels over the port.
 */
export interface RemoteHttpBridgeCancelMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "cancel";
  readonly generation: number;
  readonly requestId: string;
}

export type RemoteHttpBridgeParentMessage =
  | RemoteHttpBridgeOpenDescriptor
  | RemoteHttpBridgeAbortWindowMessage
  | RemoteHttpBridgeAbortAllMessage
  | RemoteHttpBridgeCancelMessage
  | RemoteHttpBridgeStatsQueryMessage;

/** Renderer -> utility frames. The port is per request, so only request-carrying kinds exist. */
export type RemoteHttpBridgePortUpstreamMessage =
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "upload-chunk";
      readonly requestId: string;
      readonly data: Uint8Array;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "upload-end";
      readonly requestId: string;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "cancel";
      readonly requestId: string;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "credit";
      readonly requestId: string;
      readonly bytes: number;
    };

export type RemoteHttpBridgeHeaderPairs = ReadonlyArray<readonly [string, string]>;

/**
 * Utility -> renderer frames: `upload-grant` (upload admission/window only),
 * then `head`, N chunks, `end` (or one `error`).
 */
export type RemoteHttpBridgePortDownstreamMessage =
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "head";
      readonly requestId: string;
      readonly generation: number;
      readonly status: number;
      readonly statusText: string;
      readonly headers: RemoteHttpBridgeHeaderPairs;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "upload-grant";
      readonly requestId: string;
      readonly generation: number;
      readonly bytes: number;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "chunk";
      readonly requestId: string;
      readonly generation: number;
      readonly data: Uint8Array;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "end";
      readonly requestId: string;
      readonly generation: number;
    }
  | {
      readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
      readonly kind: "error";
      readonly requestId: string;
      readonly generation: number;
      readonly code: RemoteHttpBridgeErrorCode;
      readonly message: string;
    };

/** Utility -> main settle notification. Payload-free apart from byte counts. */
export interface RemoteHttpBridgeSettledMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "settled";
  readonly generation: number;
  readonly requestId: string;
  readonly outcome: RemoteHttpBridgeOutcome;
  readonly receivedBytes: number;
  readonly sentBytes: number;
}

export interface RemoteHttpBridgeStats {
  readonly activeRequests: number;
  readonly openedRequests: number;
  readonly completedRequests: number;
  readonly failedRequests: number;
  readonly cancelledRequests: number;
  readonly timedOutRequests: number;
  readonly rejectedRequests: number;
  readonly protocolViolations: number;
  readonly uploadedBytes: number;
  readonly downloadedBytes: number;
  readonly retainedUploadBytes: number;
  readonly peakRetainedUploadBytes: number;
  /** Declared upload bytes reserved but not yet received across active requests. */
  readonly reservedUploadBytes: number;
  /**
   * Aggregate utility-side upload account: reserved + retained. Never exceeds
   * `REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES`, and equals the total bytes the
   * utility has committed to hold for replayable uploads.
   */
  readonly uploadAccountedBytes: number;
  readonly peakUploadAccountedBytes: number;
}

export interface RemoteHttpBridgeStatsReplyMessage {
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly kind: "stats-reply";
  readonly generation: number;
  readonly queryId: number;
  readonly stats: RemoteHttpBridgeStats;
}

export type RemoteHttpBridgeWorkerMessage =
  | RemoteHttpBridgeSettledMessage
  | RemoteHttpBridgeStatsReplyMessage;

/** Message main posts to the renderer with the transferred port. */
export interface RemoteHttpBridgePortEnvelope {
  readonly channel: typeof REMOTE_HTTP_BRIDGE_PORT_CHANNEL;
  readonly v: typeof REMOTE_HTTP_BRIDGE_VERSION;
  readonly requestId: string;
  readonly generation: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isRemoteHttpBridgeRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

/**
 * Realm-independent byte check: structured-clone data and test realms can
 * carry a `Uint8Array` whose constructor differs from this module's global.
 */
export function isBridgeBytes(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** Request-side header pair budget (strict; response pairs use their own). */
function isHeaderPairsWithinBudget(
  value: unknown,
  maxCount: number,
  maxNameLength: number,
  maxValueLength: number,
  maxTotalBytes: number,
): value is RemoteHttpBridgeHeaderPairs {
  if (!Array.isArray(value) || value.length > maxCount) return false;
  let total = 0;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    const [name, headerValue] = pair as [unknown, unknown];
    if (!isBoundedString(name, maxNameLength)) return false;
    if (!isBoundedString(headerValue, maxValueLength)) return false;
    total += name.length + headerValue.length;
    if (total > maxTotalBytes) return false;
  }
  return true;
}

/** Response header metadata budget enforced by the utility before posting `head`. */
export function isResponseHeaderPairsWithinBounds(
  value: unknown,
): value is RemoteHttpBridgeHeaderPairs {
  return isHeaderPairsWithinBudget(
    value,
    REMOTE_HTTP_MAX_RESPONSE_HEADER_COUNT,
    REMOTE_HTTP_MAX_RESPONSE_HEADER_NAME_LENGTH,
    REMOTE_HTTP_MAX_RESPONSE_HEADER_VALUE_LENGTH,
    REMOTE_HTTP_MAX_RESPONSE_HEADER_TOTAL_BYTES,
  );
}

/** Header metadata budget shared by main admission and utility re-validation. */
export function isHeaderBudgetWithinBounds(headers: RemoteHttpBridgeHeaders): boolean {
  const names = Object.keys(headers);
  if (names.length > REMOTE_HTTP_MAX_HEADER_COUNT) return false;
  let total = 0;
  for (const name of names) {
    const value = headers[name];
    if (!isBoundedString(name, REMOTE_HTTP_MAX_HEADER_NAME_LENGTH)) return false;
    if (!isBoundedString(value, REMOTE_HTTP_MAX_HEADER_VALUE_LENGTH)) return false;
    total += name.length + value.length;
    if (total > REMOTE_HTTP_MAX_HEADER_TOTAL_BYTES) return false;
  }
  return true;
}

export function isRemoteHttpBridgeMethod(value: unknown): value is RemoteHttpBridgeMethod {
  return (REMOTE_HTTP_BRIDGE_METHODS as readonly string[]).includes(value as string);
}

export function isRemoteHttpBridgeHeaderPairs(
  value: unknown,
): value is RemoteHttpBridgeHeaderPairs {
  return isHeaderPairsWithinBudget(
    value,
    REMOTE_HTTP_MAX_HEADER_COUNT,
    REMOTE_HTTP_MAX_HEADER_NAME_LENGTH,
    REMOTE_HTTP_MAX_HEADER_VALUE_LENGTH,
    REMOTE_HTTP_MAX_HEADER_TOTAL_BYTES,
  );
}

const OPEN_DESCRIPTOR_KEYS = [
  "v",
  "kind",
  "generation",
  "senderId",
  "requestId",
  "url",
  "method",
  "headers",
  "hasBody",
  "bodyBytes",
] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.hasOwn(value, key));
}

export function isRemoteHttpBridgeOpenDescriptor(
  value: unknown,
): value is RemoteHttpBridgeOpenDescriptor {
  if (!isRecord(value)) return false;
  // Strict by design: an unexpected field (e.g. a body payload) invalidates the
  // descriptor instead of being silently ignored on the main/utility boundary.
  const keys =
    value.certFingerprint === undefined
      ? OPEN_DESCRIPTOR_KEYS
      : [...OPEN_DESCRIPTOR_KEYS, "certFingerprint"];
  if (!hasExactKeys(value, keys)) return false;
  if (
    value.certFingerprint !== undefined &&
    value.certFingerprint !== null &&
    (typeof value.certFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.certFingerprint))
  )
    return false;
  return (
    value.v === REMOTE_HTTP_BRIDGE_VERSION &&
    value.kind === "open" &&
    isGeneration(value.generation) &&
    typeof value.senderId === "number" &&
    Number.isSafeInteger(value.senderId) &&
    value.senderId >= 0 &&
    isRemoteHttpBridgeRequestId(value.requestId) &&
    isBoundedString(value.url, REMOTE_HTTP_MAX_URL_LENGTH) &&
    isRemoteHttpBridgeMethod(value.method) &&
    isRemoteHttpBridgeHeaderRecord(value.headers) &&
    typeof value.hasBody === "boolean" &&
    value.bodyBytes !== undefined &&
    typeof value.bodyBytes === "number" &&
    Number.isSafeInteger(value.bodyBytes) &&
    value.bodyBytes >= 0 &&
    value.bodyBytes <= REMOTE_HTTP_MAX_REQUEST_BODY_BYTES &&
    (value.hasBody || value.bodyBytes === 0)
  );
}

function isRemoteHttpBridgeHeaderRecord(value: unknown): value is RemoteHttpBridgeHeaders {
  if (!isRecord(value)) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") return false;
  }
  return isHeaderBudgetWithinBounds(value as RemoteHttpBridgeHeaders);
}

export function isRemoteHttpBridgeParentMessage(
  value: unknown,
): value is RemoteHttpBridgeParentMessage {
  if (!isRecord(value) || value.v !== REMOTE_HTTP_BRIDGE_VERSION) return false;
  switch (value.kind) {
    case "open":
      return isRemoteHttpBridgeOpenDescriptor(value);
    case "abort-window":
      return (
        isGeneration(value.generation) &&
        typeof value.senderId === "number" &&
        Number.isSafeInteger(value.senderId)
      );
    case "abort-all":
      return isGeneration(value.generation);
    case "cancel":
      return isGeneration(value.generation) && isRemoteHttpBridgeRequestId(value.requestId);
    case "stats-query":
      return isGeneration(value.generation) && Number.isSafeInteger(value.queryId);
    default:
      return false;
  }
}

export function isRemoteHttpBridgePortUpstreamMessage(
  value: unknown,
): value is RemoteHttpBridgePortUpstreamMessage {
  if (!isRecord(value) || value.v !== REMOTE_HTTP_BRIDGE_VERSION) return false;
  if (!isRemoteHttpBridgeRequestId(value.requestId)) return false;
  switch (value.kind) {
    case "upload-chunk":
      return isBridgeBytes(value.data) && value.data.byteLength <= REMOTE_HTTP_UPLOAD_CHUNK_BYTES;
    case "upload-end":
    case "cancel":
      return true;
    case "credit":
      // Single-grant bound matches the client: one pull grants at most the
      // documented 1 MiB ceiling, so a larger frame is a non-conforming peer.
      return (
        typeof value.bytes === "number" &&
        Number.isSafeInteger(value.bytes) &&
        value.bytes > 0 &&
        value.bytes <= REMOTE_HTTP_RESPONSE_CREDIT_BYTES
      );
    default:
      return false;
  }
}

export function isRemoteHttpBridgePortDownstreamMessage(
  value: unknown,
): value is RemoteHttpBridgePortDownstreamMessage {
  if (!isRecord(value) || value.v !== REMOTE_HTTP_BRIDGE_VERSION) return false;
  if (!isRemoteHttpBridgeRequestId(value.requestId) || !isGeneration(value.generation))
    return false;
  switch (value.kind) {
    case "head":
      return (
        typeof value.status === "number" &&
        Number.isSafeInteger(value.status) &&
        value.status >= 100 &&
        value.status <= 599 &&
        isBoundedString(value.statusText, REMOTE_HTTP_MAX_RESPONSE_STATUS_TEXT_LENGTH) &&
        isResponseHeaderPairsWithinBounds(value.headers)
      );
    case "upload-grant":
      return (
        typeof value.bytes === "number" &&
        Number.isSafeInteger(value.bytes) &&
        value.bytes > 0 &&
        value.bytes <= REMOTE_HTTP_UPLOAD_CREDIT_BYTES
      );
    case "chunk":
      return isBridgeBytes(value.data);
    case "end":
      return true;
    case "error":
      return (
        (REMOTE_HTTP_BRIDGE_ERROR_CODES as readonly string[]).includes(value.code as string) &&
        isBoundedString(value.message, REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH)
      );
    default:
      return false;
  }
}

export function isRemoteHttpBridgeWorkerMessage(
  value: unknown,
): value is RemoteHttpBridgeWorkerMessage {
  if (!isRecord(value) || value.v !== REMOTE_HTTP_BRIDGE_VERSION) return false;
  switch (value.kind) {
    case "settled":
      return (
        isGeneration(value.generation) &&
        isRemoteHttpBridgeRequestId(value.requestId) &&
        (value.outcome === "completed" ||
          value.outcome === "failed" ||
          value.outcome === "cancelled")
      );
    case "stats-reply":
      return (
        isGeneration(value.generation) &&
        Number.isSafeInteger(value.queryId) &&
        isRecord(value.stats)
      );
    default:
      return false;
  }
}

export function isRemoteHttpBridgePortEnvelope(
  value: unknown,
): value is RemoteHttpBridgePortEnvelope {
  return (
    isRecord(value) &&
    value.channel === REMOTE_HTTP_BRIDGE_PORT_CHANNEL &&
    value.v === REMOTE_HTTP_BRIDGE_VERSION &&
    isRemoteHttpBridgeRequestId(value.requestId) &&
    isGeneration(value.generation)
  );
}
