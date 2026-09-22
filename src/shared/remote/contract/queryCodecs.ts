import { z } from "zod";
import { CATALOG_READS_CAPABILITY } from "../catalogReadContract";
import { REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION } from "../protocol/runtimeHistoryNotice";

/**
 * Explicit query-string codecs. These are the wire encoding, not Zod
 * `z.coerce` inference. Bindings must use this table instead of guessing
 * from JSON Schema number/string types.
 */
export type QueryCodecKind = "string" | "int" | "decimal" | "0-or-1" | "JSON-string";

export interface QueryParameterCodec {
  readonly name: string;
  readonly kind: QueryCodecKind;
  readonly optional: boolean;
  readonly repeated: false;
}

export class QueryCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryCodecError";
  }
}

const INTEGER_TEXT = /^-?(0|[1-9]\d*)$/;
const FINITE_NUMERIC_TEXT = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export function encodeQueryValue(kind: QueryCodecKind, value: unknown): string {
  switch (kind) {
    case "string":
      if (typeof value !== "string") {
        throw new QueryCodecError(`string codec requires a string, got ${typeof value}`);
      }
      return value;
    case "int":
      if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new QueryCodecError("int codec requires a safe integer");
      }
      return String(value);
    case "decimal": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new QueryCodecError("decimal codec requires a finite number");
      }
      const encoded = String(value);
      if (!FINITE_NUMERIC_TEXT.test(encoded) || Object.is(value, -0)) {
        throw new QueryCodecError("decimal codec requires non-exponential decimal text");
      }
      return encoded;
    }
    case "0-or-1":
      if (typeof value !== "boolean") {
        throw new QueryCodecError("0-or-1 codec requires a boolean");
      }
      return value ? "1" : "0";
    case "JSON-string": {
      let invalid = false;
      let encoded: string | undefined;
      try {
        encoded = JSON.stringify(value, (_key, nested: unknown) => {
          if (
            nested === undefined ||
            typeof nested === "function" ||
            typeof nested === "symbol" ||
            typeof nested === "bigint" ||
            (typeof nested === "number" && !Number.isFinite(nested))
          ) {
            invalid = true;
          }
          return nested;
        });
      } catch {
        invalid = true;
      }
      if (invalid || typeof encoded !== "string") {
        throw new QueryCodecError("JSON-string codec cannot encode this value");
      }
      return encoded;
    }
  }
}

export function decodeQueryValue(kind: QueryCodecKind, raw: string): unknown {
  switch (kind) {
    case "string":
      return raw;
    case "int": {
      if (!INTEGER_TEXT.test(raw)) {
        throw new QueryCodecError(`not int: ${raw}`);
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) {
        throw new QueryCodecError(`int overflow: ${raw}`);
      }
      return value;
    }
    case "decimal": {
      if (!FINITE_NUMERIC_TEXT.test(raw) || raw === "-0") {
        throw new QueryCodecError(`not decimal: ${raw}`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new QueryCodecError(`not finite: ${raw}`);
      }
      return value;
    }
    case "0-or-1":
      if (raw === "0") return false;
      if (raw === "1") return true;
      throw new QueryCodecError(`not 0-or-1: ${raw}`);
    case "JSON-string": {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new QueryCodecError("JSON-string is not valid JSON");
      }
    }
  }
}

function param(name: string, kind: QueryCodecKind, optional: boolean): QueryParameterCodec {
  return { name, kind, optional, repeated: false };
}

/** HTTP route query-parameter codecs, keyed by route id. */
export const ROUTE_QUERY_CODECS: Readonly<Record<string, readonly QueryParameterCodec[]>> = {
  "forward-enter": [param("fwt", "string", false)],
  // Gate 6 item 4.6 (S6): the image routes' `<img>` credential is the one-time
  // path-scoped ticket; the raw bearer query parameter is gone from the wire.
  "local-image": [param("path", "string", false), param("ticket", "string", true)],
  "runtime-image": [param("path", "JSON-string", false), param("ticket", "string", true)],
  "attachment-upload": [param("threadId", "string", false), param("name", "string", false)],
  "schedule-runs-read": [param("id", "string", false)],
  "pr-watch-read": [param("projectId", "string", false), param("prNumber", "int", false)],
  "thread-history": [
    param("reads", "string", true),
    param("notices", "string", true),
    param("runtimePage", "string", true),
    param("targetTimelineEntryCount", "int", true),
    param("omitScrollback", "0-or-1", true),
    param("completedTurnsLimit", "int", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
  "thread-history-items": [
    param("reads", "string", true),
    param("notices", "string", true),
    param("beforePosition", "int", true),
    param("limit", "int", false),
    param("targetTimelineEntryCount", "int", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
  "thread-turns": [
    param("reads", "string", true),
    param("notices", "string", true),
    param("cursor", "string", true),
    param("limit", "int", true),
    param("completedTurnsLimit", "int", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
  // B1 declared-only gap recovery routes: `notices=v1` is required, so an
  // undeclared caller is a 400 protocol error rather than an accidental ack.
  "thread-runtime-gap": [param("notices", "string", false)],
  "thread-runtime-gap-acknowledge": [param("notices", "string", false)],
  "agent-statuses": [param("slashCommands", "0-or-1", true)],
  "shell-snapshot": [
    param("reads", "string", true),
    param("threadLimit", "int", true),
    param("order", "string", true),
    param("projectLimit", "int", true),
    param("summaries", "0-or-1", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
  "thread-list": [
    param("reads", "string", true),
    param("cursor", "string", true),
    param("limit", "int", true),
    param("order", "string", true),
    param("mode", "string", true),
    param("summaries", "0-or-1", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
  "project-list": [
    param("reads", "string", true),
    param("cursor", "string", true),
    param("mode", "string", true),
    param("order", "string", true),
    param("projectLimit", "int", true),
    param("maxBytes", "int", true),
    param("maxDecodeBytes", "int", true),
  ],
};

/**
 * Desktop-internal loopback opt-in (V5 plan 2.5): the `/ws` query parameter a
 * co-located desktop renderer sets to request the desktop-internal session
 * kind. The server honors it only when the upgrade originates from a loopback
 * address (see `wsConnections.ts`), so a remote peer sending it can never
 * widen its event surface. Declared here next to the other handshake
 * parameter names; the compatibility-policy wording lives in
 * `protocolFacts.ts`, which cannot import this module (the dependency runs
 * the other way).
 */
export const REMOTE_DESKTOP_INTERNAL_WS_PARAM = "desktopInternal";

/** Resume cursor of the desktop-internal replayable stream. */
export const REMOTE_DESKTOP_INTERNAL_SEQ_PARAM = "lastDesktopSeq";

/** WebSocket handshake query codecs from the protocol manifest. */
export const WEBSOCKET_QUERY_CODECS: readonly QueryParameterCodec[] = [
  param("ticket", "string", false),
  param("lastSeenSeq", "int", true),
  param("threadItemInterests", "JSON-string", true),
  // Desktop-internal loopback opt-in. Honored only for loopback-origin
  // upgrades; every other peer is admitted as an ordinary session.
  param(REMOTE_DESKTOP_INTERNAL_WS_PARAM, "0-or-1", true),
  // Resume cursor of the desktop-internal replayable stream. Ignored unless
  // the connection was admitted as desktop-internal.
  param(REMOTE_DESKTOP_INTERNAL_SEQ_PARAM, "int", true),
];

export const LOSSY_QUERY_METADATA_KINDS = [
  "z.coerce.number",
  "Number()",
  "JSON.parse-unchecked",
] as const;

export function queryCodecsForRoute(routeId: string): readonly QueryParameterCodec[] {
  return ROUTE_QUERY_CODECS[routeId] ?? [];
}

/** Decoded (not wire) query object schemas. Codecs own the string conversion. */
export const decodedForwardEnterQuerySchema = z.object({
  fwt: z.string(),
});

export const decodedLocalImageQuerySchema = z.object({
  path: z.string().min(1),
  ticket: z.string().min(1).optional(),
});

export const decodedRuntimeImageQuerySchema = z.object({
  path: z
    .array(z.union([z.string(), z.number().int()]))
    .min(1)
    .max(8),
  ticket: z.string().min(1).optional(),
});

export const decodedAttachmentUploadQuerySchema = z.object({
  threadId: z.string().min(1),
  name: z.string().min(1).max(255),
});

export const decodedPrWatchReadQuerySchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
});

/**
 * B4 bounded-reads capability echo. Absent means the request keeps the legacy
 * variant; any other value is a protocol error the host rejects with
 * `invalid_reads_capability` (never a silent downgrade).
 */
const decodedReadsCapabilitySchema = z.literal(CATALOG_READS_CAPABILITY);
const decodedCatalogPaintOrderSchema = z.enum(["manual", "updated", "created"]);
const decodedCatalogReadModeSchema = z.enum(["page", "inventory"]);
const decodedCatalogByteCapSchema = z.number().int().min(1);
/**
 * B1 per-request history-notice declaration. Absent means the reader cannot
 * render a notice (it is refused on a notice thread); any other value is a
 * protocol error the host rejects with `invalid_notices_capability`.
 */
const decodedNoticesDeclarationSchema = z.literal(REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION);

export const decodedThreadHistoryQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  notices: decodedNoticesDeclarationSchema.optional(),
  runtimePage: z.literal("1").optional(),
  targetTimelineEntryCount: z.number().int().min(1).max(100).optional(),
  /** WS3 #2: cursor-sync clients get the authoritative tail from the watch
   * baseline instead — skip the inlined terminalScrollback for this fetch. */
  omitScrollback: z.boolean().optional(),
  completedTurnsLimit: z.number().int().min(1).max(500).optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});

export const decodedThreadHistoryItemsQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  notices: decodedNoticesDeclarationSchema.optional(),
  beforePosition: z.number().int().nonnegative().optional(),
  /** Required on the legacy route; declared clients default it to 500. */
  limit: z.number().int().min(1).max(500).optional(),
  targetTimelineEntryCount: z.number().int().min(1).max(100).optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});

/** `GET /api/threads/{threadId}/turns` — `ct1.` completed-turn continuation. */
export const decodedThreadTurnsQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  notices: decodedNoticesDeclarationSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  completedTurnsLimit: z.number().int().min(1).max(500).optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});

/** Declared-only `GET /api/threads/{threadId}/runtime/gap` query. */
export const decodedRuntimeGapQuerySchema = z.object({
  notices: decodedNoticesDeclarationSchema,
});

/** Declared-only `POST /api/threads/{threadId}/runtime/gap/acknowledge` query. */
export const decodedRuntimeGapAcknowledgeQuerySchema = z.object({
  notices: decodedNoticesDeclarationSchema,
});

export const decodedAgentStatusesQuerySchema = z.object({
  slashCommands: z.boolean().optional(),
});

/**
 * Gate 4 hazard #3: opting in bounds the shell snapshot's thread list to the
 * first `threadLimit` rows and returns `threadsNextCursor` for the remainder.
 * Clients that omit the parameter get the historical full list and no cursor.
 *
 * B4 adds the declared-client bundle: `reads` selects the bounded path, while
 * `order`/`projectLimit`/`summaries`/byte caps are ignored without it.
 */
export const decodedShellSnapshotQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  threadLimit: z.number().int().min(1).max(200).optional(),
  order: decodedCatalogPaintOrderSchema.optional(),
  projectLimit: z.number().int().min(1).max(200).optional(),
  summaries: z.boolean().optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});

export const decodedThreadListQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  /** Continuation cursor from the previous page's `nextCursor`. */
  cursor: z.string().min(1).optional(),
  /** Required on the legacy route; declared clients default it to 100. */
  limit: z.number().int().min(1).max(200).optional(),
  order: decodedCatalogPaintOrderSchema.optional(),
  mode: decodedCatalogReadModeSchema.optional(),
  summaries: z.boolean().optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});

/** `GET /api/projects` — bounded project paint/inventory page (declared only). */
export const decodedProjectListQuerySchema = z.object({
  reads: decodedReadsCapabilitySchema.optional(),
  cursor: z.string().min(1).optional(),
  mode: decodedCatalogReadModeSchema.optional(),
  order: decodedCatalogPaintOrderSchema.optional(),
  projectLimit: z.number().int().min(1).max(200).optional(),
  maxBytes: decodedCatalogByteCapSchema.optional(),
  maxDecodeBytes: decodedCatalogByteCapSchema.optional(),
});
