/**
 * Parser for Devin's `_cognition.ai/*` agent→client extension notifications.
 *
 * Wire-confirmed notifications get strict bounded typed shapes:
 * `mcp/serversChanged` ({} in every capture), `thinking_complete`,
 * `turn_stats` and `agent_stopped` (live-qualified on 3000.11.3,
 * tmp/devin/e4/results/local-notifications.json — they flow on every turn).
 * Everything else in the vendor namespace parses as `unknown` and is safely
 * ignored upstream with a bounded, redacted diagnostic — unknown
 * notifications must never error the stream or be treated as success of some
 * operation. A malformed captured-shape payload also parses as `unknown`
 * rather than throwing.
 */

import { assertBoundedJson } from "@/shared/jsonBounds";

import { DEVIN_ACP_VENDOR_META_PREFIX } from "./capabilityManifest";

export const DEVIN_ACP_MCP_SERVERS_CHANGED_NOTIFICATION = `_${DEVIN_ACP_VENDOR_META_PREFIX}mcp/serversChanged`;
export const DEVIN_ACP_THINKING_COMPLETE_NOTIFICATION = `_${DEVIN_ACP_VENDOR_META_PREFIX}thinking_complete`;
export const DEVIN_ACP_TURN_STATS_NOTIFICATION = `_${DEVIN_ACP_VENDOR_META_PREFIX}turn_stats`;
export const DEVIN_ACP_AGENT_STOPPED_NOTIFICATION = `_${DEVIN_ACP_VENDOR_META_PREFIX}agent_stopped`;

/** One self-describing stat dimension from `turn_stats`/`agent_stopped`. */
export interface DevinAcpStatDimension {
  uid: string;
  groupTitle: string | undefined;
  label: string | undefined;
  /** Metric payload preserved verbatim (agent-owned rendering hints). */
  kind: Record<string, unknown>;
}

export type DevinAcpExtensionNotification =
  | {
      kind: "mcp-servers-changed";
      /** Raw params ({} in every capture); preserved for future detail. */
      params: Record<string, unknown>;
    }
  | {
      kind: "thinking-complete";
      sessionId: string | undefined;
      /** Thought-block duration and index; optional — shape may grow. */
      durationMs: number | undefined;
      blockIndex: number | undefined;
    }
  | {
      kind: "turn-stats";
      sessionId: string | undefined;
      /** Correlates the stats with the client prompt that produced the turn. */
      turnClientMessageId: string | undefined;
      /** Bounded self-describing stat dimensions for host rendering. */
      dimensions: DevinAcpStatDimension[];
    }
  | {
      kind: "agent-stopped";
      sessionId: string | undefined;
      /** Agent-reported cause (e.g. "complete"); never replaces the standard
       * session/prompt stop reason — it arrives alongside it. */
      cause: string | undefined;
      /** Bounded turn stats (toolCalls, tokens, timing, dimensions...). */
      stats: Record<string, unknown>;
    }
  | { kind: "unknown"; method: string };

/** Max top-level keys retained in an unknown-notification diagnostic. */
const MAX_DIAGNOSTIC_KEYS = 16;
/** Max stat dimensions retained from a turn_stats/agent_stopped payload. */
const MAX_STAT_DIMENSIONS = 64;
/** Max length of any string field kept from a captured-shape notification. */
const MAX_NOTIFICATION_STRING = 200;
/** Serialized-size bound for a preserved verbatim stats payload. */
const MAX_STATS_BYTES = 64 * 1024;

const boundedString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_NOTIFICATION_STRING
    ? value
    : undefined;

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const parseStatDimension = (entry: unknown): DevinAcpStatDimension | undefined => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  const uid = boundedString(record.uid);
  if (!uid) return undefined;
  return {
    uid,
    groupTitle: boundedString(record.groupTitle),
    label: boundedString(record.label),
    kind:
      record.kind && typeof record.kind === "object" && !Array.isArray(record.kind)
        ? (record.kind as Record<string, unknown>)
        : {},
  };
};

const parseStatDimensions = (value: unknown): DevinAcpStatDimension[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  // A list past the bound is a contract violation → unknown, never truncated
  // (truncated stats would misreport the turn).
  if (value.length > MAX_STAT_DIMENSIONS) return undefined;
  const dimensions: DevinAcpStatDimension[] = [];
  for (const entry of value) {
    const dimension = parseStatDimension(entry);
    if (!dimension) return undefined;
    dimensions.push(dimension);
  }
  return dimensions;
};

export function parseDevinAcpExtensionNotification(
  method: string,
  params: unknown,
): DevinAcpExtensionNotification | undefined {
  const record =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};
  if (method === DEVIN_ACP_MCP_SERVERS_CHANGED_NOTIFICATION) {
    return { kind: "mcp-servers-changed", params: record };
  }
  if (method === DEVIN_ACP_THINKING_COMPLETE_NOTIFICATION) {
    const durationMs = finiteNumber(record.durationMs);
    const blockIndex = finiteNumber(record.blockIndex);
    const sessionId = boundedString(record.sessionId);
    // Captured shape requires durationMs + blockIndex; anything else (or a
    // non-object) falls back to unknown instead of guessing.
    if (durationMs === undefined || blockIndex === undefined) {
      return { kind: "unknown", method };
    }
    return { kind: "thinking-complete", sessionId, durationMs, blockIndex };
  }
  if (method === DEVIN_ACP_TURN_STATS_NOTIFICATION) {
    const dimensions = parseStatDimensions(record.responseDimensions);
    if (!dimensions) return { kind: "unknown", method };
    return {
      kind: "turn-stats",
      sessionId: boundedString(record.sessionId),
      turnClientMessageId: boundedString(record.turnClientMessageId),
      dimensions,
    };
  }
  if (method === DEVIN_ACP_AGENT_STOPPED_NOTIFICATION) {
    const cause = boundedString(record.cause);
    const stats =
      record.stats && typeof record.stats === "object" && !Array.isArray(record.stats)
        ? (record.stats as Record<string, unknown>)
        : undefined;
    if (!cause || !stats) return { kind: "unknown", method };
    // Preserved verbatim (agent-owned status data) but size-bounded: a
    // bloated stats payload is a contract violation → unknown, never error.
    try {
      assertBoundedJson(stats, MAX_STATS_BYTES);
    } catch {
      return { kind: "unknown", method };
    }
    return {
      kind: "agent-stopped",
      sessionId: boundedString(record.sessionId),
      cause,
      stats,
    };
  }
  if (method.startsWith(`_${DEVIN_ACP_VENDOR_META_PREFIX}`)) {
    return { kind: "unknown", method };
  }
  // Not this provider's namespace.
  return undefined;
}

/**
 * Bounded redacted summary of an unknown notification's params: top-level
 * keys only, capped, never values — diagnostics without a payload leak.
 */
export function summarizeDevinAcpNotificationParams(params: unknown): string {
  const record =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};
  const keys = Object.keys(record).slice(0, MAX_DIAGNOSTIC_KEYS);
  const omitted = Object.keys(record).length - keys.length;
  return keys.length === 0 ? "{}" : `{${keys.join(", ")}${omitted > 0 ? `, …+${omitted}` : ""}}`;
}
