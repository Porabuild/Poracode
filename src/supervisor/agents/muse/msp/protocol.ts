/**
 * Hand-written TypeScript for the MSP (Muse Session Protocol) wire subset
 * Poracode speaks. Derived from the `muse schema generate-json-schema`
 * export of Muse Code 1.0.2:
 *
 *   muse schema generate-json-schema --out DIR   (offline, instant)
 *
 * Pinned bundle: schema version 1, fingerprint
 * `sha256:03312c213efd14277a0e0a102f70adeae497a469ca4edf7242f479953ed758b7`.
 * To regenerate: re-run the export against the installed binary, copy the
 * bundle over `msp/fixtures/msp.schema.json`, run
 * `pnpm exec oxfmt msp/fixtures/msp.schema.json` (fixtures are format-checked),
 * and run `msp/schemaFixture.test.ts` — it fails on method/enum drift against
 * the names used below. The schema is additive-open by design: the client and
 * mapper must ignore unknown methods, fields, and item kinds.
 *
 * Transport: newline-delimited JSON-RPC 2.0 over the `muse serve` stdio
 * pipes (verified live). Handshake is `initialize` then a bare
 * `initialized` notification; anything earlier is rejected `notInitialized`.
 *
 * Implementation strategy: hand-rolled client, not `@muse-code/sdk`. The
 * official SDK (MIT, zero-dep) covers the same ground, but it is pre-1.0
 * with no stability promise, its pinned schema fingerprint matches neither
 * this host generation nor the transcript corpus, and Poracode-specific
 * mapping, WSL routing, and thread lifecycle must be ours regardless.
 * Revisit when the SDK reaches 1.0 with a stability promise, its
 * fingerprint aligns with our minimum supported host, and WSL spawn
 * override is confirmed. Useful references either way:
 * https://meta-models.github.io/muse-code-sdk/ and the transcript corpus at
 * github.com/meta-models/muse-code-sdk/tree/main/schema/msp/transcripts.
 */

export const MSP_SCHEMA_VERSION = 1;
export const MSP_SCHEMA_FINGERPRINT =
  "sha256:03312c213efd14277a0e0a102f70adeae497a469ca4edf7242f479953ed758b7";

export type MspRequestId = number | string;

export interface MspRpcRequest {
  jsonrpc: "2.0";
  id: MspRequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface MspRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  emittedAtMs?: number;
}

export interface MspRpcSuccess {
  jsonrpc: "2.0";
  id: MspRequestId;
  result: Record<string, unknown>;
}

export interface MspRpcErrorDetail {
  code: number;
  message: string;
  data?: { kind?: string; [key: string]: unknown };
  retryable?: boolean;
}

export interface MspRpcErrorFrame {
  jsonrpc: "2.0";
  id: MspRequestId | null;
  error: MspRpcErrorDetail;
}

/**
 * JSON-RPC error with MSP's structured detail attached. `kind` carries the
 * Appendix B registry kind when present (e.g. `notInitialized`,
 * `commandRejected`, `sessionInUse`, `sessionNotFound`); unknown shapes still
 * produce an error, never a silent drop.
 */
export class MspRpcError extends Error {
  readonly code: number;
  readonly kind: string | undefined;
  readonly requestId: MspRequestId | null;
  readonly data: Record<string, unknown> | undefined;
  /**
   * The server's own retry verdict when present (`overloaded` and
   * `backpressured` are retryable with backoff; `inputTooLarge` never is).
   * Absent on older hosts — see {@link isRetryableMspError} for the
   * kind-based fallback the errors guide prescribes.
   */
  readonly retryable: boolean | undefined;

  constructor(
    message: string,
    options: {
      code: number;
      kind?: string;
      requestId?: MspRequestId | null;
      data?: Record<string, unknown>;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "MspRpcError";
    this.code = options.code;
    this.kind = options.kind;
    this.requestId = options.requestId ?? null;
    this.data = options.data;
    this.retryable = options.retryable;
  }
}

export function isMspRpcError(error: unknown): error is MspRpcError {
  return error instanceof MspRpcError;
}

/**
 * Whether a failed request is worth retrying. The server's explicit
 * `retryable` verdict wins when present; otherwise `overloaded` and
 * `backpressured` retry with exponential backoff and jitter (backpressure
 * guide), everything else fails fast. Callers reuse the request's
 * `commandId` on retry so an admitted command is not submitted twice.
 */
export function isRetryableMspError(error: unknown): boolean {
  if (!isMspRpcError(error)) return false;
  if (error.retryable !== undefined) return error.retryable;
  return error.kind === "overloaded" || error.kind === "backpressured";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Parse one decoded stdio line into a request/response/notification frame. */
export function parseMspFrame(message: unknown):
  | {
      kind: "response";
      id: MspRequestId;
      result?: Record<string, unknown>;
      error?: MspRpcErrorDetail;
    }
  | { kind: "notification"; method: string; params: Record<string, unknown> }
  | { kind: "request"; id: MspRequestId; method: string; params: Record<string, unknown> }
  | { kind: "unknown" } {
  if (!isRecord(message) || message["jsonrpc"] !== "2.0") return { kind: "unknown" };
  if (typeof message["method"] === "string") {
    const params = message["params"];
    const normalizedParams = isRecord(params) ? params : {};
    if (message["id"] === undefined || message["id"] === null) {
      return { kind: "notification", method: message["method"], params: normalizedParams };
    }
    if (typeof message["id"] === "number" || typeof message["id"] === "string") {
      return {
        kind: "request",
        id: message["id"],
        method: message["method"],
        params: normalizedParams,
      };
    }
    return { kind: "unknown" };
  }
  if (typeof message["id"] === "number" || typeof message["id"] === "string") {
    if (isRecord(message["result"])) {
      return { kind: "response", id: message["id"], result: message["result"] };
    }
    if (isRecord(message["error"])) {
      const detail = message["error"];
      const code = typeof detail["code"] === "number" ? detail["code"] : -32603;
      const text = typeof detail["message"] === "string" ? detail["message"] : "MSP error";
      const data = isRecord(detail["data"]) ? detail["data"] : undefined;
      const kind = data && typeof data["kind"] === "string" ? data["kind"] : undefined;
      const retryable =
        data && typeof data["retryable"] === "boolean" ? data["retryable"] : undefined;
      return {
        kind: "response",
        id: message["id"],
        error: {
          code,
          message: text,
          ...(data ? { data: { ...data, ...(kind ? { kind } : {}) } } : {}),
          ...(retryable !== undefined ? { retryable } : {}),
        },
      };
    }
  }
  return { kind: "unknown" };
}

export interface MspClientInfo {
  /** Machine identifier, `^[a-z0-9_]+$` — enforced server-side. */
  name: string;
  version: string;
  title?: string;
}

export interface MspInitializeResult {
  serverInfo: { name: string; version: string };
  schema: { fingerprint: string; version: number };
  sessionDurability: string;
  grantedCapabilities: string[];
  museHome: string;
  userAgent: string;
  experimentalApi: boolean;
}

export function parseMspInitializeResult(result: Record<string, unknown>): MspInitializeResult {
  const serverInfo = isRecord(result["serverInfo"]) ? result["serverInfo"] : {};
  const schema = isRecord(result["schema"]) ? result["schema"] : {};
  const granted = Array.isArray(result["grantedCapabilities"])
    ? result["grantedCapabilities"].filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    serverInfo: {
      name: typeof serverInfo["name"] === "string" ? serverInfo["name"] : "",
      version: typeof serverInfo["version"] === "string" ? serverInfo["version"] : "",
    },
    schema: {
      fingerprint: typeof schema["fingerprint"] === "string" ? schema["fingerprint"] : "",
      version: typeof schema["version"] === "number" ? schema["version"] : 0,
    },
    sessionDurability:
      typeof result["sessionDurability"] === "string" ? result["sessionDurability"] : "durable",
    grantedCapabilities: granted,
    museHome: typeof result["museHome"] === "string" ? result["museHome"] : "",
    userAgent: typeof result["userAgent"] === "string" ? result["userAgent"] : "",
    experimentalApi: result["experimentalApi"] === true,
  };
}

/** One visible row of the `model/list` catalog. */
export interface MspModelCatalogEntry {
  modelId: string;
  displayLabel: string;
  contextLimit: number | null;
  isDefault: boolean;
  isActive: boolean;
  providerId: string;
}

export function parseMspModelCatalogEntry(entry: unknown): MspModelCatalogEntry | undefined {
  if (!isRecord(entry)) return undefined;
  if (typeof entry["modelId"] !== "string" || typeof entry["displayLabel"] !== "string") {
    return undefined;
  }
  return {
    modelId: entry["modelId"],
    displayLabel: entry["displayLabel"],
    contextLimit: typeof entry["contextLimit"] === "number" ? entry["contextLimit"] : null,
    isDefault: entry["isDefault"] === true,
    isActive: entry["isActive"] === true,
    providerId: typeof entry["providerId"] === "string" ? entry["providerId"] : "",
  };
}

export interface MspModelListResult {
  models: MspModelCatalogEntry[];
  profileId: string | null;
  providerId: string;
  source: string;
}

export function parseMspModelListResult(result: Record<string, unknown>): MspModelListResult {
  const models = Array.isArray(result["models"])
    ? result["models"].flatMap((entry) => {
        const parsed = parseMspModelCatalogEntry(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    models,
    profileId: typeof result["profileId"] === "string" ? result["profileId"] : null,
    providerId: typeof result["providerId"] === "string" ? result["providerId"] : "",
    source: typeof result["source"] === "string" ? result["source"] : "",
  };
}
