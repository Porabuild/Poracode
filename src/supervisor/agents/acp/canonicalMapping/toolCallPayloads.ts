/**
 * Build/merge canonical tool-call payloads from ACP `tool_call` /
 * `tool_call_update` notifications.
 */

import type { CanonicalItemType, RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import {
  extractAcpFileChangesFromContent,
  hasSubstantialAcpRawOutput,
  joinAcpContentFileChangeDiffs,
  summarizeAcpContentFileChanges,
} from "../acpFileChangeContent";
import { readDiffSummary } from "../../fileChangeSummary";
import {
  classifyFileChangeKind,
  extractFileChangePath,
  extractToolCallContentImages,
  extractToolCallContentText,
  extractToolLocations,
  normalizeDiffSummaryForKind,
  normalizeToolText,
  readStringField,
} from "./contentExtraction";
import { closeOpenContentItems, resetMapperForTurnEnd } from "./state";
import type { AcpMapperState, AcpToolCallItemState } from "./state";

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
    content?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  isSubAgent: boolean,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
): Record<string, unknown> {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const locations = extractToolLocations(toolCall.locations);
  const name = title ?? kind ?? "tool";
  const contentResult = extractToolCallContentText(toolCall.content, resolveTerminalOutput);
  const images = extractToolCallContentImages(toolCall.content);
  const subAgentModel = isSubAgent ? readStringField(toolCall.rawInput, "model") : undefined;
  const base: Record<string, unknown> = {
    name,
    args: toolCall.rawInput,
    status,
    ...(contentResult !== undefined ? { result: contentResult } : {}),
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
      ...(commandResult !== undefined ? { result: commandResult } : {}),
      command,
      ...(cwd ? { cwd } : {}),
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
    return {
      ...base,
      ...(contentDiffText ? { result: contentDiffText } : {}),
      path: path ?? "",
      changeKind,
      ...(diffSummary ? { diffSummary: normalizeDiffSummaryForKind(changeKind, diffSummary) } : {}),
      ...(primary ? { editOldText: primary.oldText, editNewText: primary.newText } : {}),
    };
  }
  if (itemType === "web_search") {
    const query = readStringField(toolCall.rawInput, "query") ?? title ?? kind ?? name;
    return { ...base, query };
  }
  return base;
}

export function buildAcpToolCallUpdatePayload(
  item: AcpToolCallItemState,
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawOutput?: unknown;
    content?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
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
  const contentResult = extractToolCallContentText(
    toolCall.content,
    resolveTerminalOutput,
    item.terminalId,
  );
  const images = extractToolCallContentImages(toolCall.content);
  const isFileChange = item.itemType === "file_change";
  const contentDiffs = isFileChange ? extractAcpFileChangesFromContent(toolCall.content) : [];
  const contentDiffText = isFileChange ? joinAcpContentFileChangeDiffs(contentDiffs) : undefined;
  const result = pickAcpToolCallResult({
    contentDiffText,
    rawOutput: toolCall.rawOutput,
    contentResult,
    itemType: item.itemType,
    payload: item.payload,
    resolveTerminalOutputByCommand,
  });
  const payload: Record<string, unknown> = {
    status,
    ...(result !== undefined ? { result } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(title || kind ? { name: title ?? kind } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(item.isSubAgent ? { isSubAgent: true } : {}),
  };
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
      payload.editOldText = primary.oldText;
      payload.editNewText = primary.newText;
    }
  }
  return payload;
}

function pickAcpToolCallResult(args: {
  contentDiffText: string | undefined;
  rawOutput: unknown;
  contentResult: string | undefined;
  itemType: AcpToolCallItemState["itemType"];
  payload: AcpToolCallItemState["payload"];
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined;
}): unknown {
  if (args.contentDiffText !== undefined) return args.contentDiffText;
  if (hasSubstantialAcpRawOutput(args.rawOutput)) return args.rawOutput;
  if (args.contentResult !== undefined) return args.contentResult;
  if (args.itemType === "command_execution") {
    return resolveTerminalOutputForCommandPayload(
      args.payload,
      args.resolveTerminalOutputByCommand,
    );
  }
  return undefined;
}

export function finalizeToolCallPayload(
  state: AcpMapperState,
  item: AcpToolCallItemState,
): Record<string, unknown> {
  if (item.itemType !== "command_execution" || item.payload.result !== undefined) {
    return item.payload;
  }
  const result = resolveTerminalOutputForCommandPayload(
    item.payload,
    state.resolveTerminalOutputByCommand,
  );
  return result !== undefined ? { ...item.payload, result } : item.payload;
}

/** Close any open assistant/user/reasoning/tool-call/plan items as a turn boundary. */
export function closeOpenTurnItems(state: AcpMapperState): RuntimeEvent[] {
  const events = closeOpenContentItems(state);
  for (const item of state.toolCallItems.values()) {
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
  payload: Record<string, unknown>,
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined,
): string | undefined {
  const command = typeof payload.command === "string" ? payload.command : undefined;
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
