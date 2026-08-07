/**
 * Normalize Grok's backend web-search tool calls into the provider-agnostic
 * shape the shared ACP mapper already understands.
 *
 * Grok runs web search server-side, so the opening `tool_call` knows nothing
 * about the search yet: it carries `rawInput: { variant: "WebSearch", backend:
 * true }` plus the placeholder title `"Web search:"` (the CLI formats
 * `Web search: <query>` before the query exists). The mapper therefore records
 * `query: "Web search:"` and the row stays that way — the actual query and the
 * pages that were consulted only arrive later under `rawOutput.action`, where
 * they end up as an opaque JSON blob.
 *
 * This transform bridges the two ends: it drops the dangling placeholder on the
 * way in, and on the way out lifts `action.query` onto `rawInput.query` (the
 * mapper's canonical query source) and the visited URLs onto `rawOutput.contents`
 * text blocks — the one-block-per-result shape the renderer already counts and
 * lists for other providers. The tool's own title stays the tool name so the row
 * can still label itself `Web search: <query>`.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { plainRecord, readString, withUpdate } from "./acpRecord";

/** `rawInput.variant` Grok stamps on every backend web-search tool call. */
const GROK_WEB_SEARCH_VARIANT = "WebSearch";

interface GrokSearchAction {
  query: string | undefined;
  /** Pages the backend consulted, in the order Grok reported them. */
  urls: string[];
}

export type GrokWebSearchNormalizer = (
  notification: SessionNotification,
  update: Record<string, unknown>,
  toolCallId: string,
) => SessionNotification | undefined;

/**
 * Returns the rewritten notification for Grok web-search tool calls, or
 * `undefined` when the notification belongs to any other tool.
 */
export function createGrokWebSearchNormalizer(): GrokWebSearchNormalizer {
  // `tool_call_update` omits the launch `rawInput`, so keep it around to merge
  // the query into rather than replacing the tool's own arguments.
  const rawInputByToolCallId = new Map<string, Record<string, unknown>>();

  return (notification, update, toolCallId) => {
    const rawInput = plainRecord(update.rawInput);
    const action = readGrokSearchAction(update.rawOutput);
    const known = rawInputByToolCallId.has(toolCallId);
    if (!known && rawInput.variant !== GROK_WEB_SEARCH_VARIANT && !action) return undefined;
    if (!known || Object.keys(rawInput).length > 0) {
      rawInputByToolCallId.set(toolCallId, rawInput);
    }

    const next: Record<string, unknown> = { ...update };
    const title = readString(update, "title");
    const stripped = title ? stripPlaceholderSuffix(title) : undefined;
    if (stripped) next.title = stripped;
    if (action?.query) {
      next.rawInput = { ...rawInputByToolCallId.get(toolCallId), query: action.query };
    }
    if (action && action.urls.length > 0) {
      next.rawOutput = {
        ...plainRecord(update.rawOutput),
        contents: action.urls.map((url) => ({ type: "text", text: url })),
      };
    }
    if (update.status === "completed" || update.status === "failed") {
      rawInputByToolCallId.delete(toolCallId);
    }
    return withUpdate(notification, next);
  };
}

function readGrokSearchAction(rawOutput: unknown): GrokSearchAction | undefined {
  const action = plainRecord(plainRecord(rawOutput).action);
  if (readString(action, "type") !== "search") return undefined;
  const sources = Array.isArray(action.sources) ? action.sources : [];
  const urls = sources
    .map((source) => readString(plainRecord(source), "url"))
    .filter((url): url is string => url !== undefined);
  return { query: readString(action, "query"), urls };
}

/**
 * Trim the trailing separator left behind when Grok formats a title around a
 * value it doesn't have yet (`"Web search:"`). Returns `undefined` when there is
 * nothing to trim, so the caller keeps the agent's own title untouched.
 */
function stripPlaceholderSuffix(title: string): string | undefined {
  const trimmed = title.replace(/[\s:]+$/, "");
  return trimmed.length > 0 && trimmed !== title ? trimmed : undefined;
}
