/**
 * Canonical item payload builders and stream/type mapping for Codex items.
 */

import type { CanonicalItemType, RuntimeContentStreamKind } from "@/shared/contracts";
import { readDiffSummary } from "../../fileChangeSummary";
import { goalPayloadFromProviderState } from "../../goalRuntime";
import { isCodexCollabAgentToolCall, readCollabAgentProgress } from "./collabAgent";
import { readCodexGoalStatus } from "./goal";
import { type CodexItemPayload, extractMessageText, readChangesPayload } from "./readers";
import {
  classifyCodexFileChangeKind,
  codexFinalStatus,
  countWebSearchResults,
  extractCodexFileChangePath,
  extractCodexWebSearchQuery,
  isToolLikeItemType,
  pickCodexWebSearchInput,
  pickToolInput,
  pickToolOutput,
  readCodexChangesDiffSummary,
  toolName,
  toolServerId,
} from "./toolExtraction";

/**
 * Map a streaming-delta method name to its content stream kind.
 */
export function contentStreamForMethod(method: string): RuntimeContentStreamKind | undefined {
  switch (method) {
    case "item/agentMessage/delta":
      return "assistant_text";
    case "item/reasoning/textDelta":
    case "item/reasoning/summaryTextDelta":
      return "reasoning_text";
    case "item/commandExecution/outputDelta":
      return "command_output";
    case "item/fileChange/outputDelta":
      return "file_change_output";
    case "item/plan/delta":
      return "plan_text";
    default:
      return undefined;
  }
}

export function canonicalTypeFromStream(stream: RuntimeContentStreamKind): CanonicalItemType {
  switch (stream) {
    case "assistant_text":
      return "assistant_message";
    case "reasoning_text":
      return "reasoning";
    case "plan_text":
      return "plan";
    case "command_output":
      return "command_execution";
    case "file_change_output":
      return "file_change";
  }
}

export function buildStartedPayload(
  itemType: CanonicalItemType,
  source: CodexItemPayload,
): unknown {
  if (itemType === "command_execution") {
    return {
      command: typeof source.command === "string" ? source.command : "",
      ...(typeof source.cwd === "string" ? { cwd: source.cwd } : {}),
      status: "running",
    };
  }
  if (itemType === "file_change") {
    const args = pickToolInput(source);
    const path = extractCodexFileChangePath(source);
    const changesPayload = readChangesPayload(source);
    const diffSummary =
      readCodexChangesDiffSummary(source.changes) ?? readDiffSummary(source, args);
    return {
      path: path ?? "",
      ...(typeof source.title === "string" && source.title.length > 0
        ? { title: source.title }
        : {}),
      ...(typeof source.name === "string" && source.name.length > 0 ? { name: source.name } : {}),
      changeKind: classifyCodexFileChangeKind(source),
      ...(diffSummary ? { diffSummary } : {}),
      ...(args !== undefined
        ? { args }
        : changesPayload !== undefined
          ? { args: changesPayload }
          : {}),
      status: "running" as const,
    };
  }
  if (itemType === "web_search") {
    const query = extractCodexWebSearchQuery(source);
    const args = pickCodexWebSearchInput(source);
    return {
      query: query ?? "",
      ...(toolName(source) ? { name: toolName(source) } : {}),
      ...(args !== undefined ? { args } : {}),
      status: "running" as const,
    };
  }
  if (itemType === "assistant_message" || itemType === "user_message") {
    const text = extractMessageText(source);
    return { content: text.length > 0 ? [{ kind: "text", text }] : [] };
  }
  if (isToolLikeItemType(itemType)) {
    const args = pickToolInput(source);
    const serverId = toolServerId(source);
    const isSubAgent = isCodexCollabAgentToolCall(source);
    const progress = isSubAgent ? readCollabAgentProgress(source) : undefined;
    return {
      name: toolName(source) ?? "tool",
      ...(serverId ? { serverId } : {}),
      ...(args !== undefined ? { args } : {}),
      ...(progress ? { progress } : {}),
      ...(isSubAgent ? { isSubAgent: true } : {}),
      status: "running" as const,
    };
  }
  if (itemType === "plan") return { steps: [] };
  if (itemType === "goal") {
    return goalPayloadFromProviderState(
      {
        ...(typeof source.text === "string" ? { objective: source.text } : {}),
        ...(readCodexGoalStatus(source.status)
          ? { status: readCodexGoalStatus(source.status) }
          : {}),
      },
      "updated",
    );
  }
  if (itemType === "reasoning") return {};
  return undefined;
}

export function buildCompletedPayload(
  itemType: CanonicalItemType,
  source: CodexItemPayload,
): unknown {
  if (itemType === "command_execution") {
    return {
      ...(typeof source.status === "string"
        ? { status: source.status === "failed" ? "error" : "success" }
        : {}),
      ...(typeof source.exitCode === "number" ? { exitCode: source.exitCode } : {}),
      ...(typeof source.durationMs === "number" ? { durationMs: source.durationMs } : {}),
    };
  }
  if (isToolLikeItemType(itemType)) {
    const result = pickToolOutput(source);
    const progress = isCodexCollabAgentToolCall(source)
      ? readCollabAgentProgress(source)
      : undefined;
    return {
      status: codexFinalStatus(source.status),
      ...(result !== undefined ? { result } : {}),
      ...(progress ? { progress } : {}),
    };
  }
  if (itemType === "file_change") {
    const result = pickToolOutput(source);
    const path = extractCodexFileChangePath(source);
    const changesPayload = readChangesPayload(source);
    const diffSummary =
      readCodexChangesDiffSummary(source.changes) ?? readDiffSummary(source, result);
    return {
      ...(path ? { path } : {}),
      ...(typeof source.title === "string" && source.title.length > 0
        ? { title: source.title }
        : {}),
      ...(typeof source.name === "string" && source.name.length > 0 ? { name: source.name } : {}),
      changeKind: classifyCodexFileChangeKind(source),
      ...(diffSummary ? { diffSummary } : {}),
      status: codexFinalStatus(source.status),
      ...(result !== undefined
        ? { result }
        : changesPayload !== undefined
          ? { result: changesPayload }
          : {}),
    };
  }
  if (itemType === "web_search") {
    const result = pickToolOutput(source);
    const resultCount = countWebSearchResults(source);
    const query = extractCodexWebSearchQuery(source);
    return {
      status: codexFinalStatus(source.status),
      ...(query ? { query } : {}),
      ...(resultCount != null ? { resultCount } : {}),
      ...(result !== undefined ? { result } : {}),
    };
  }
  return undefined;
}
