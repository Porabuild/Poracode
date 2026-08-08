/**
 * Shared title/count derivation for canonical `web_search` rows, used by both
 * the standalone accordion and the grouped inline row so the two can't drift.
 *
 * Providers disagree on what the payload carries: Grok and Codex name the tool
 * (`Web search` / `webSearch`) and keep the query separate, Claude folds the
 * whole call into `query`, and OpenCode reuses the type for page fetches whose
 * `name` is the fetched URL. Only the first shape gets the `Web search: <query>`
 * prefix treatment — the others already read as a complete label on their own.
 */

import { msg } from "@lingui/core/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import type { WebSearchPayload } from "@/shared/contracts";

export interface WebSearchDisplay {
  title: string;
  /** Set when the row shows `<tool name>: <query>`; mirrors `ToolDisplay["parts"]`. */
  parts?: { prefix: string; path: string };
  resultCount?: number;
  hasDetails: boolean;
}

export function deriveWebSearchDisplay(
  payload: WebSearchPayload,
  t: TranslateFn,
): WebSearchDisplay {
  const label = t(msg`Web search`);
  const name = readPayloadString(payload, "name");
  // A query that is just the tool's name is a placeholder, not a search: the
  // canonical `query` falls back to the ACP title, and servers that search
  // remotely (Grok) only learn the real query once the results come back.
  // Treating it as unknown keeps the running row from reading `Web search ·
  // Web search`.
  const rawQuery = payload.query?.trim();
  const query = rawQuery && !isGenericWebSearchName(rawQuery) ? rawQuery : undefined;
  const resultCount = payload.resultCount ?? deriveResultCount(payload);
  const base = {
    hasDetails: hasAuxFields(payload),
    ...(resultCount != null ? { resultCount } : {}),
  };
  if (query && isGenericWebSearchName(name)) {
    const prefix = `${label}: `;
    return { ...base, title: `${prefix}${query}`, parts: { prefix, path: query } };
  }
  return { ...base, title: query || (name && !isGenericWebSearchName(name) ? name : label) };
}

/**
 * Whether `name` is the tool's own name rather than a per-call label. Providers
 * spell it `WebSearch`, `webSearch`, `web_search` or `Web search:` — all of
 * those are redundant with the localized label and leave the query free to be
 * shown next to it.
 */
function isGenericWebSearchName(name: string | undefined): boolean {
  return name !== undefined && /^web[\s_-]?search:?$/i.test(name.trim());
}

function hasAuxFields(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.args !== undefined || p.result !== undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * When a structured `resultCount` isn't present (codex doesn't surface it,
 * older ACP servers may not), derive it from the tool's `result.contents`
 * array — ACP, codex and the Grok web-search normalizer all put per-result
 * blocks there.
 */
function deriveResultCount(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return undefined;
  const contents = (result as Record<string, unknown>).contents;
  if (Array.isArray(contents)) return contents.length;
  return undefined;
}
