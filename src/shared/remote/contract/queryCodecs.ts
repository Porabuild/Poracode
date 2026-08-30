import { z } from "zod";

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
  "local-image": [param("path", "string", false), param("access_token", "string", true)],
  "runtime-image": [param("path", "JSON-string", false), param("access_token", "string", true)],
  "attachment-upload": [param("threadId", "string", false), param("name", "string", false)],
  "schedule-runs-read": [param("id", "string", false)],
  "pr-watch-read": [param("projectId", "string", false), param("prNumber", "int", false)],
  "thread-history": [
    param("runtimePage", "string", true),
    param("targetTimelineEntryCount", "int", true),
  ],
  "thread-history-items": [
    param("beforePosition", "int", true),
    param("limit", "int", false),
    param("targetTimelineEntryCount", "int", true),
  ],
};

/** WebSocket handshake query codecs from the protocol manifest. */
export const WEBSOCKET_QUERY_CODECS: readonly QueryParameterCodec[] = [
  param("ticket", "string", false),
  param("lastSeenSeq", "int", true),
  param("threadItemInterests", "JSON-string", true),
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
  access_token: z.string().min(1).optional(),
});

export const decodedRuntimeImageQuerySchema = z.object({
  path: z
    .array(z.union([z.string(), z.number().int()]))
    .min(1)
    .max(8),
  access_token: z.string().min(1).optional(),
});

export const decodedAttachmentUploadQuerySchema = z.object({
  threadId: z.string().min(1),
  name: z.string().min(1).max(255),
});

export const decodedPrWatchReadQuerySchema = z.object({
  projectId: z.string().min(1),
  prNumber: z.number().int().min(1),
});

export const decodedThreadHistoryQuerySchema = z.object({
  runtimePage: z.literal("1").optional(),
  targetTimelineEntryCount: z.number().int().min(1).max(100).optional(),
});

export const decodedThreadHistoryItemsQuerySchema = z.object({
  beforePosition: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500),
  targetTimelineEntryCount: z.number().int().min(1).max(100).optional(),
});
