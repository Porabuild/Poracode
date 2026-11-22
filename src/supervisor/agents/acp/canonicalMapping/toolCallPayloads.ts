/**
 * Build/merge canonical tool-call payloads from ACP `tool_call` /
 * `tool_call_update` notifications.
 */

import type { CanonicalItemType, RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { isUserAttachmentImageReadPayload } from "@/shared/inlineImagePayload";
import {
  extractAcpFileChangesFromContent,
  hasSubstantialAcpRawOutput,
  joinAcpContentFileChangeDiffs,
  summarizeAcpContentFileChanges,
} from "../acpFileChangeContent";
import { classifyFileChangeKind, normalizeDiffSummaryForKind } from "../../fileChangeKind";
import { readDiffSummary, readStringField } from "../../fileChangeSummary";
import {
  extractFileChangePath,
  extractToolCallContentImages,
  extractToolCallResourceResult,
  extractToolCallContentText,
  extractToolCallResourceLinkResult,
  extractToolLocations,
  normalizeToolText,
} from "./contentExtraction";
import { closeOpenContentItems, resetMapperForTurnEnd } from "./state";
import type { AcpMapperState, AcpToolCallItemState } from "./state";
import { flushTextStreamExtension } from "./textStreamExtension";
import { readAcpCommandStatus } from "./commandStatus";

/**
 * Cap optional full-file `editOldText`/`editNewText` snapshots attached to ACP
 * `file_change` payloads. Larger edits already carry their compact unified diff
 * in `payload.result` and line counts in `payload.diffSummary`; embedding whole
 * multi-megabyte files bloats IPC bursts, SQLite rows, and remote live streams.
 *
 * No schema or database version bump. Stored string snapshots stay valid, and
 * readers accept only strings. `null` is a shallow-merge clear when a later
 * update outgrows this cap; older string-only readers ignore it. Omitted keys
 * mean the snapshot was never stored.
 */
const MAX_INLINE_EDIT_SNAPSHOT_CHARS = 128 * 1024;

/**
 * Neutral `_meta` key a provider transform sets when the wire `title` is
 * display copy (for example `"Calling spawn_agent from crossagents"`) and a
 * separate field carries the canonical tool identifier (`mcp__server__tool`).
 */
export const PORACODE_ACP_TOOL_NAME_META_KEY = "poracodeToolName";

export function readAcpToolName(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  if (!Object.hasOwn(meta, PORACODE_ACP_TOOL_NAME_META_KEY)) return undefined;
  const value = (meta as Record<string, unknown>)[PORACODE_ACP_TOOL_NAME_META_KEY];
  return typeof value === "string" ? normalizeToolText(value) : undefined;
}

function shouldEmbedInlineEditSnapshot(change: { oldText: string; newText: string }): boolean {
  return change.oldText.length + change.newText.length <= MAX_INLINE_EDIT_SNAPSHOT_CHARS;
}

/**
 * Build the canonical chat-item payload for an ACP `tool_call`.
 *
 * ACP carries a single `(name, rawInput, rawOutput, status)` shape for every
 * kind of tool. After we classify the tool into one of our richer canonical
 * types, the renderer expects type-specific fields (`command`, `path`, `query`)
 * — so we extract those from `rawInput` here. The original `name`/`args` are
 * preserved on the payload so the unified accordion body can still surface the
 * full request for inspection.
 */
export function buildAcpToolCallPayload(
  itemType: CanonicalItemType,
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawInput?: unknown;
    rawOutput?: unknown;
    content?: unknown;
    _meta?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  isSubAgent: boolean,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
  resolveLocalImage?: (pathOrFileUri: string) => string | undefined,
): Record<string, unknown> {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const locations = extractToolLocations(toolCall.locations);
  // Only carry a `name` when we actually have one. A bare ACP `tool_call`
  // (neither `title` nor `kind`, e.g. Cursor's near-empty initial events) must
  // NOT fabricate a `"tool"` sentinel — that defeats the renderer's
  // `!payload.name` hide-unnamed guards and paints an anonymous accordion row.
  // Omitting `name` defers the row until a later update carries a real label;
  // finalization (`finalizeToolCallPayload`) guarantees it never stays nameless.
  const canonicalName = readAcpToolName(toolCall._meta);
  const name = canonicalName ?? title ?? kind;
  const contentResult = extractToolCallContentText(toolCall.content, resolveTerminalOutput);
  const resourceResult = extractToolCallResourceResult(
    toolCall.content,
    toolCall.rawOutput,
    resolveTerminalOutput,
  );
  const resourceLinkResult =
    itemType === "tool_call" &&
    kind?.toLowerCase() === "search" &&
    contentResult === undefined &&
    resourceResult === undefined &&
    !hasSubstantialAcpRawOutput(toolCall.rawOutput)
      ? extractToolCallResourceLinkResult(toolCall.content)
      : undefined;
  // Images may be inline base64, a `uri`-only reference, or — for a completed
  // read-kind call — only named by `locations`; the session-injected resolver
  // is what turns the latter two into renderable data URLs. Skip echoing back
  // images the user already attached to the conversation.
  const isUserAttachmentRead = isUserAttachmentImageReadPayload({
    ...(name ? { name } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    args: toolCall.rawInput,
    ...(locations.length > 0 ? { locations } : {}),
  });
  const images = isUserAttachmentRead
    ? []
    : extractToolCallContentImages(toolCall.content, {
        kind,
        status,
        locations,
        resolveLocalImage,
      });
  const subAgentModel = isSubAgent ? readStringField(toolCall.rawInput, "model") : undefined;
  const commandStatus =
    itemType === "command_execution" ? readAcpCommandStatus(toolCall._meta) : undefined;
  const base: Record<string, unknown> = {
    ...(name ? { name } : {}),
    args: toolCall.rawInput,
    status,
    ...(resourceResult !== undefined
      ? { result: resourceResult }
      : contentResult !== undefined
        ? { result: contentResult }
        : resourceLinkResult !== undefined
          ? { result: resourceLinkResult }
          : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(isSubAgent ? { isSubAgent: true } : {}),
    ...(subAgentModel ? { progress: { model: subAgentModel } } : {}),
  };
  if (itemType === "command_execution") {
    const cmd = readStringField(toolCall.rawInput, "command");
    const cwd = readStringField(toolCall.rawInput, "cwd");
    // Gemini's ACP shell tool puts the command in `title`, not `rawInput.command`,
    // so fall back to the title (minus a generic descriptor) when rawInput is bare.
    const fallback = commandFromToolTitle(title, kind);
    const command = cmd ?? fallback ?? "";
    const commandResult =
      contentResult === undefined && command.length > 0
        ? resolveTerminalOutputByCommand?.(command)
        : undefined;
    return {
      ...base,
      ...(commandResult !== undefined
        ? {
            result: resourceResult
              ? {
                  ...resourceResult,
                  content: [...resourceResult.content, { type: "text", text: commandResult }],
                }
              : commandResult,
          }
        : {}),
      command,
      ...(cwd ? { cwd } : {}),
      ...(commandStatus?.exitCode !== undefined ? { exitCode: commandStatus.exitCode } : {}),
    };
  }
  if (itemType === "file_change") {
    const contentDiffs = extractAcpFileChangesFromContent(toolCall.content);
    const contentDiffText = joinAcpContentFileChangeDiffs(contentDiffs);
    const primary = contentDiffs[0];
    const path = extractFileChangePath(toolCall.rawInput, title, kind, locations) ?? primary?.path;
    const diffSummary =
      summarizeAcpContentFileChanges(contentDiffs) ??
      readDiffSummary(toolCall.rawInput, contentDiffText);
    const changeKind = classifyFileChangeKind(
      kind,
      title,
      toolCall.rawInput,
      primary,
      contentDiffText,
    );
    const embedSnapshot = primary !== undefined && shouldEmbedInlineEditSnapshot(primary);
    return {
      ...base,
      ...(contentDiffText ? { result: contentDiffText } : {}),
      path: path ?? "",
      changeKind,
      ...(diffSummary ? { diffSummary: normalizeDiffSummaryForKind(changeKind, diffSummary) } : {}),
      ...(embedSnapshot ? { editOldText: primary.oldText, editNewText: primary.newText } : {}),
    };
  }
  if (itemType === "web_search") {
    const query = readStringField(toolCall.rawInput, "query") ?? title ?? kind;
    return { ...base, ...(query ? { query } : {}) };
  }
  return base;
}

export function buildAcpToolCallUpdatePayload(
  item: AcpToolCallItemState,
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawInput?: unknown;
    rawOutput?: unknown;
    content?: unknown;
    _meta?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
  resolveLocalImage?: (pathOrFileUri: string) => string | undefined,
): Record<string, unknown> {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const locations = extractToolLocations(toolCall.locations);
  // ACP carries tool output either as `rawOutput` (Copilot), inline
  // `content: ToolCallContent[]` text blocks, or `content` entries of type
  // `"terminal"` that point at a client-hosted PTY (Gemini's run_shell_command).
  // Prefer the structured rawOutput when present so the renderer can pretty-print
  // JSON; otherwise inline text / terminal output (the `item.terminalId` hint
  // lets us keep snapshotting PTY output when the agent stops including the
  // terminal reference on later status updates).
  const text = extractToolCallContentText(toolCall.content, resolveTerminalOutput, item.terminalId);
  const searchKind = kind ?? readPayloadString(item.payload, "kind");
  const resourceLinkResult =
    item.itemType === "tool_call" &&
    searchKind?.toLowerCase() === "search" &&
    text === undefined &&
    !hasSubstantialAcpRawOutput(toolCall.rawOutput)
      ? extractToolCallResourceLinkResult(toolCall.content)
      : undefined;
  const commandStatus =
    item.itemType === "command_execution" ? readAcpCommandStatus(toolCall._meta) : undefined;
  const attributedOutput =
    item.itemType === "command_execution" && item.attributedTerminalId && !item.terminalId
      ? resolveTerminalOutput?.(item.attributedTerminalId)
      : undefined;
  let contentResult = text;
  if (contentResult === undefined && resourceLinkResult !== undefined) {
    contentResult = resourceLinkResult;
  }
  // Attributed terminal output leads and a declared status line follows it.
  // Without that declaration, the agent's text is its output and stays unchanged.
  if (attributedOutput) {
    if (text === undefined) contentResult = attributedOutput;
    else if (commandStatus) {
      contentResult = `${attributedOutput}${attributedOutput.endsWith("\n") ? "" : "\n"}${text}`;
    }
  }
  const effectiveKind = kind ?? readPayloadString(item.payload, "kind");
  const effectiveLocations = locations.length > 0 ? locations : readPayloadLocations(item.payload);
  const isUserAttachmentRead = isUserAttachmentImageReadPayload({
    name: title ?? readPayloadString(item.payload, "name") ?? effectiveKind,
    title: title ?? readPayloadString(item.payload, "title"),
    kind: effectiveKind,
    args: toolCall.rawInput ?? item.payload.args,
    locations: effectiveLocations,
  });
  const images = isUserAttachmentRead
    ? []
    : extractToolCallContentImages(toolCall.content, {
        // A `tool_call_update` often repeats neither `kind` nor `locations` — both
        // arrived on the opening `tool_call` — so fall back to the tracked payload.
        kind: effectiveKind,
        status,
        locations: effectiveLocations,
        resolveLocalImage,
      });
  const isFileChange = item.itemType === "file_change";
  const contentDiffs = isFileChange ? extractAcpFileChangesFromContent(toolCall.content) : [];
  const contentDiffText = isFileChange ? joinAcpContentFileChangeDiffs(contentDiffs) : undefined;
  const mappedResult =
    extractToolCallResourceResult(
      toolCall.content,
      toolCall.rawOutput,
      resolveTerminalOutput,
      item.terminalId,
    ) ??
    pickAcpToolCallResult({
      contentDiffText,
      rawOutput: toolCall.rawOutput,
      contentResult,
      itemType: item.itemType,
      command:
        readStringField(toolCall.rawInput, "command") ?? readPayloadString(item.payload, "command"),
      resolveTerminalOutputByCommand,
    });
  const result =
    mappedResult ??
    (item.itemType === "tool_call" && searchKind?.toLowerCase() === "search"
      ? item.payload.result
      : undefined);
  const canonicalName = readAcpToolName(toolCall._meta);
  // Never let a kind-only update clobber a better title-derived name, and never
  // let a later display-only title clobber a provider-declared canonical name.
  const nameUpdate =
    canonicalName ??
    (item.hasCanonicalName
      ? undefined
      : (title ?? (kind && !hasToolCallName(item.payload) ? kind : undefined)));
  const payload: Record<string, unknown> = {
    status,
    ...(result !== undefined ? { result } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(nameUpdate ? { name: nameUpdate } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(item.isSubAgent ? { isSubAgent: true } : {}),
  };
  if (item.itemType === "command_execution") {
    // Agents that stream tool input (or learn it after the call opens) send
    // the real command in a later `rawInput`; refresh the captured placeholder,
    // just as later web-search updates refresh the query.
    const command = readStringField(toolCall.rawInput, "command");
    const cwd = readStringField(toolCall.rawInput, "cwd");
    if (command) payload.command = command;
    if (cwd) payload.cwd = cwd;
    if (commandStatus?.exitCode !== undefined) payload.exitCode = commandStatus.exitCode;
  }
  if (isFileChange) {
    const primary = contentDiffs[0];
    const path = extractFileChangePath(toolCall.rawOutput, title, kind, locations) ?? primary?.path;
    if (path) payload.path = path;
    const diffSummary =
      summarizeAcpContentFileChanges(contentDiffs) ??
      readDiffSummary(toolCall.rawOutput, contentDiffText);
    const changeKind = classifyFileChangeKind(
      kind,
      title,
      toolCall.rawOutput,
      primary,
      contentDiffText,
      item.payload,
    );
    if (diffSummary) payload.diffSummary = normalizeDiffSummaryForKind(changeKind, diffSummary);
    payload.changeKind = changeKind;
    if (primary) {
      if (shouldEmbedInlineEditSnapshot(primary)) {
        payload.editOldText = primary.oldText;
        payload.editNewText = primary.newText;
      } else if (
        typeof item.payload.editOldText === "string" ||
        typeof item.payload.editNewText === "string"
      ) {
        payload.editOldText = null;
        payload.editNewText = null;
      }
    }
  }
  if (item.itemType === "web_search") {
    // Servers that run the search remotely (Grok) only learn the query once the
    // results come back, so a later `rawInput.query` / `title` has to replace
    // the placeholder query captured when the call opened.
    const query = readStringField(toolCall.rawInput, "query") ?? title;
    if (query) payload.query = query;
  }
  return payload;
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function readPayloadLocations(payload: Record<string, unknown>): readonly { path: string }[] {
  const value = payload.locations;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string"
      ? [{ path: (entry as { path: string }).path }]
      : [],
  );
}

function pickAcpToolCallResult(args: {
  contentDiffText: string | undefined;
  rawOutput: unknown;
  contentResult: string | undefined;
  itemType: AcpToolCallItemState["itemType"];
  command: string | undefined;
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined;
}): unknown {
  if (args.contentDiffText !== undefined) return args.contentDiffText;
  if (hasSubstantialAcpRawOutput(args.rawOutput)) return args.rawOutput;
  if (args.contentResult !== undefined) return args.contentResult;
  if (args.itemType === "command_execution") {
    return resolveTerminalOutputForCommandPayload(
      args.command,
      args.resolveTerminalOutputByCommand,
    );
  }
  return undefined;
}

export function finalizeToolCallPayload(
  state: AcpMapperState,
  item: AcpToolCallItemState,
): Record<string, unknown> {
  // A finalized tool call must never remain nameless — the renderer hides
  // unnamed rows, so a bare ACP call that completes (or is orphaned when the
  // turn ends) without ever receiving a title/kind would silently vanish.
  const payload = ensureToolCallName(item.payload);
  if (item.itemType !== "command_execution" || payload.result !== undefined) {
    return payload;
  }
  if (item.attributedTerminalId && !item.terminalId) {
    const output = state.resolveTerminalOutput?.(item.attributedTerminalId);
    if (output) return { ...payload, result: output };
  }
  const result = resolveTerminalOutputForCommandPayload(
    typeof payload.command === "string" ? payload.command : undefined,
    state.resolveTerminalOutputByCommand,
  );
  return result !== undefined ? { ...payload, result } : payload;
}

const GENERIC_TOOL_NAME = "Tool";

/** Whether a payload already carries a usable (non-empty) `name`. */
export function hasToolCallName(payload: Record<string, unknown>): boolean {
  return typeof payload.name === "string" && payload.name.trim().length > 0;
}

/**
 * Generic display name for a tool call that reached a terminal state without a
 * title or kind-derived name. Prefer the tool `kind` if one was ever seen, else
 * a capitalized generic label the renderer surfaces verbatim (no new
 * user-facing literal is introduced in the renderer — this originates in the
 * macro-free supervisor).
 */
function toolCallFallbackName(payload: Record<string, unknown>): string {
  const kind = normalizeToolText(typeof payload.kind === "string" ? payload.kind : undefined);
  return kind ?? GENERIC_TOOL_NAME;
}

/** Return `payload` with a guaranteed `name`, falling back when it has none. */
export function ensureToolCallName(payload: Record<string, unknown>): Record<string, unknown> {
  return hasToolCallName(payload) ? payload : { ...payload, name: toolCallFallbackName(payload) };
}

/**
 * Apply the terminal fallback name to a completing tool call's merged/emitted
 * payload pair (the `tool_call_update` completion path bypasses
 * `finalizeToolCallPayload`). Ensures both the tracked state and the emitted
 * `item.completed` payload carry a name so the row can't finish hidden.
 */
export function applyTerminalToolCallName(
  merged: Record<string, unknown>,
  emitted: Record<string, unknown>,
): { merged: Record<string, unknown>; emitted: Record<string, unknown> } {
  if (hasToolCallName(merged)) return { merged, emitted };
  const name = toolCallFallbackName(merged);
  return { merged: { ...merged, name }, emitted: { ...emitted, name } };
}

/** Close any open assistant/user/reasoning/tool-call/plan items as a turn boundary. */
export function closeOpenTurnItems(state: AcpMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  events.push(...flushTextStreamExtension(state));
  events.push(...closeOpenContentItems(state));
  for (const [toolCallId, item] of state.toolCallItems) {
    if (item.detached) continue;
    events.push(...closeOpenContentItems(state, toolCallId));
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: item.itemId,
      payload: finalizeToolCallPayload(state, item),
    });
  }
  if (state.openPlanItemId) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: state.openPlanItemId,
      payload: {
        steps: (state.openPlanSteps ?? []).map((step) => ({
          ...step,
          status: step.status === "in_progress" ? "pending" : step.status,
        })),
      },
    });
  }
  resetMapperForTurnEnd(state);
  return events;
}

function resolveTerminalOutputForCommandPayload(
  command: string | undefined,
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined,
): string | undefined {
  if (!command || !resolveTerminalOutputByCommand) return undefined;
  return resolveTerminalOutputByCommand(command);
}

export function mergeToolPayload(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...prev, ...next };
  const prevProgress = prev.progress;
  const nextProgress = next.progress;
  if (
    prevProgress &&
    typeof prevProgress === "object" &&
    !Array.isArray(prevProgress) &&
    nextProgress &&
    typeof nextProgress === "object" &&
    !Array.isArray(nextProgress)
  ) {
    merged.progress = {
      ...(prevProgress as ToolCallPayload["progress"]),
      ...(nextProgress as ToolCallPayload["progress"]),
    };
  }
  return merged;
}

export function mergeProgressForEmission(
  next: Record<string, unknown>,
  merged: Record<string, unknown>,
): Record<string, unknown> {
  if (!next.progress || typeof next.progress !== "object" || Array.isArray(next.progress)) {
    return next;
  }
  const progress = merged.progress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return next;
  return { ...next, progress };
}

/** Find the first `ToolCallContent` entry of type `"terminal"` and return its id. */
export function findTerminalIdInContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type === "terminal" && typeof e.terminalId === "string" && e.terminalId.length > 0) {
      return e.terminalId;
    }
  }
  return undefined;
}

/**
 * Try to recover the shell command from an ACP `tool_call` title when the
 * agent didn't put it under `rawInput.command`. Gemini's ACP server passes the
 * bare command as the title (e.g. `"git status"`), so the title IS the command
 * unless it's a generic placeholder like `"shell"` / `"execute"` /
 * `"shell exec"`. Returns `undefined` when the title is just a descriptor —
 * the renderer then falls back to its own `(command)` placeholder, matching
 * the prior behavior.
 */
function commandFromToolTitle(
  title: string | undefined,
  kind: string | undefined,
): string | undefined {
  if (!title) return undefined;
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === (kind ?? "").toLowerCase()) return undefined;
  if (/^(shell|execute|exec|run|run\s+command|shell\s+exec)$/.test(lower)) return undefined;
  return trimmed;
}
