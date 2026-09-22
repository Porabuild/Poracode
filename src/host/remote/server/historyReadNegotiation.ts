import {
  CATALOG_READS_CAPABILITY,
  HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
  HISTORY_COMPLETED_TURNS_MAX_LIMIT,
  HISTORY_ITEMS_DEFAULT_LIMIT,
  HISTORY_ITEMS_MAX_LIMIT,
} from "@/shared/remote/historyReadContract";
import { remoteTimelineEntryCountSchema } from "@/shared/remote";
import { RemoteHttpError } from "../auth";
import { resolveCatalogEffectiveCaps, type CatalogEffectiveCaps } from "./catalogPageBudget";
import { parseRuntimeHistoryNoticesDeclaration } from "./runtimeHistoryNoticeGate";

/**
 * B4 bounded-history negotiation: `reads=bounded-v1` plus the additive
 * `maxBytes`/`maxDecodeBytes`/`completedTurnsLimit` params, and the per-route
 * item/turn cursor params. Undeclared requests are left exactly as the legacy
 * handlers parse them; a wrong `reads` value is a protocol error.
 *
 * B1 adds the independent `notices=v1` declaration: it is parsed for every
 * request (legacy or bounded) because the history-notice gate applies to both,
 * while `reads` alone keeps selecting the bounded bundle.
 */

export interface HistoryReadNegotiation {
  readonly declared: boolean;
  /** The request declared `notices=v1` (can render the durable notice). */
  readonly noticesDeclared: boolean;
  readonly caps: CatalogEffectiveCaps;
  readonly completedTurnsLimit: number;
}

const INTEGER_TEXT = /^(0|[1-9]\d*)$/u;

function invalid(message: string, code = "invalid_read_param"): RemoteHttpError {
  return new RemoteHttpError(code, message, 400);
}

export function parsePositiveIntParam(
  raw: string | null,
  code: string,
  label: string,
  maximum: number,
): number | undefined {
  if (raw === null) return undefined;
  if (!INTEGER_TEXT.test(raw)) {
    throw invalid(`${label} must be an integer between 1 and ${maximum}.`, code);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw invalid(`${label} must be an integer between 1 and ${maximum}.`, code);
  }
  return value;
}

/**
 * Parses the bounded-history negotiation. Undeclared requests return
 * `declared: false` and every declared-only param is ignored, exactly like the
 * legacy handlers do; a wrong `reads` value is a protocol error.
 */
export function parseHistoryReadNegotiation(url: URL): HistoryReadNegotiation {
  const params = url.searchParams;
  const noticesDeclared = parseRuntimeHistoryNoticesDeclaration(url);
  const reads = params.get("reads");
  if (reads === null) {
    return {
      declared: false,
      noticesDeclared,
      caps: resolveCatalogEffectiveCaps({}),
      completedTurnsLimit: HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
    };
  }
  if (reads !== CATALOG_READS_CAPABILITY) {
    throw invalid(
      `reads must be "${CATALOG_READS_CAPABILITY}" when present.`,
      "invalid_reads_capability",
    );
  }
  const maxBytes = parsePositiveIntParam(
    params.get("maxBytes"),
    "invalid_max_bytes",
    "maxBytes",
    Number.MAX_SAFE_INTEGER,
  );
  const maxDecodeBytes = parsePositiveIntParam(
    params.get("maxDecodeBytes"),
    "invalid_max_decode_bytes",
    "maxDecodeBytes",
    Number.MAX_SAFE_INTEGER,
  );
  return {
    declared: true,
    noticesDeclared,
    caps: resolveCatalogEffectiveCaps({
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(maxDecodeBytes !== undefined ? { maxDecodeBytes } : {}),
    }),
    completedTurnsLimit:
      parsePositiveIntParam(
        params.get("completedTurnsLimit"),
        "invalid_completed_turns_limit",
        "completedTurnsLimit",
        HISTORY_COMPLETED_TURNS_MAX_LIMIT,
      ) ?? HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
  };
}

export function parseItemsLimit(url: URL): number {
  return (
    parsePositiveIntParam(
      url.searchParams.get("limit"),
      "invalid_thread_limit",
      "limit",
      HISTORY_ITEMS_MAX_LIMIT,
    ) ?? HISTORY_ITEMS_DEFAULT_LIMIT
  );
}

export function parseTurnsLimit(url: URL, negotiation: HistoryReadNegotiation): number {
  return (
    parsePositiveIntParam(
      url.searchParams.get("limit"),
      "invalid_completed_turns_limit",
      "limit",
      HISTORY_COMPLETED_TURNS_MAX_LIMIT,
    ) ?? negotiation.completedTurnsLimit
  );
}

export function parseBeforePosition(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw invalid("beforePosition must be a nonnegative integer.", "invalid_request");
  }
  return value;
}

export function parseTargetTimelineEntryCount(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  return remoteTimelineEntryCountSchema.parse(Number(raw));
}
