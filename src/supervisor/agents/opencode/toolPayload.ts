/**
 * Tool-call mapping for the OpenCode canonical mapper: item classification,
 * the canonical row payload, and result/metadata absorption.
 *
 * Mirrors OpenCode 1's `canonicalMapping/toolPayload.ts`: every payload
 * carries `name`/`status` (plus `args`/`result` once known) so the unified
 * accordion body can surface the full request/response, with canonical
 * type-specific fields (`command`, `path`, `query`) layered on top.
 */

import type { CanonicalItemType, SubAgentStatus } from "@/shared/contracts";
import { isChatVideoSource } from "@/shared/chatVideo";
import { isUserAttachmentImageReadPayload } from "@/shared/inlineImagePayload";
import { readNonNegativeInteger } from "../contextUsage";
import { readDiffSummary } from "../fileChangeSummary";
import { readOpenCodeNumber, readOpenCodeRecord, readOpenCodeString } from "./readers";

export interface OpenCodeToolItemState {
  itemId: string;
  itemType: CanonicalItemType;
  /** True once the row's `item.started` has been emitted. */
  announced: boolean;
  name: string;
  status: "running" | "success" | "error";
  /** Raw JSON text while the tool input is still streaming. */
  inputText: string;
  input: Record<string, unknown> | undefined;
  /** Progress fields from `session.tool.progress` worth surfacing. */
  progress: Record<string, unknown>;
  result: unknown;
  images: string[] | undefined;
  errorMessage: string | undefined;
  /**
   * True while a subagent launch row is held open past its own call because
   * the child session is still working (see `OpenCodeSubagents`). The call
   * itself has settled, so `status` keeps protecting the row from the mapper's
   * dangling-tool cleanup; only the published payload reads as running.
   */
  held?: boolean;
  /** True once the row is known to track a child session that works on its own. */
  background?: boolean;
  /** Lifecycle of the subagent a launch row tracks, once its run ended. */
  subAgentStatus?: SubAgentStatus;
}

export function createOpenCodeToolItem(itemId: string, toolName: string): OpenCodeToolItemState {
  return {
    itemId,
    itemType: classifyOpenCodeToolItemType(toolName),
    announced: false,
    name: toolName,
    status: "running",
    inputText: "",
    input: undefined,
    progress: {},
    result: undefined,
    images: undefined,
    errorMessage: undefined,
  };
}

/** Only native tool names imply a specialized row; plugin names are opaque. */
function classifyOpenCodeToolItemType(toolName: string): CanonicalItemType {
  const name = toolName.trim().toLowerCase();
  if (/^(bash|shell|command)$/.test(name)) {
    return "command_execution";
  }
  if (/^(create|edit|write|patch|apply_patch|multiedit|delete|rm)$/.test(name)) {
    return "file_change";
  }
  if (/^(webfetch|websearch)$/.test(name)) {
    return "web_search";
  }
  return "tool_call";
}

/** Canonical payload for a tool row; mirrors OpenCode 1's `toolPayload`. */
export function openCodeToolPayload(tool: OpenCodeToolItemState): Record<string, unknown> {
  const input = tool.input;
  const title = openCodeToolTitle(tool.name, input);
  const kind = openCodeToolKind(tool.name);
  const locations = openCodeToolLocations(tool.name, input);
  const suppressUserAttachmentImages = isUserAttachmentImageReadPayload({
    name: tool.name,
    ...(title !== tool.name ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations ? { locations } : {}),
    ...(input !== undefined ? { args: input } : {}),
  });
  const base: Record<string, unknown> = {
    name: title,
    status: tool.held ? "running" : tool.status,
    ...(title !== tool.name ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations ? { locations } : {}),
    ...(input !== undefined ? { args: input } : {}),
    // A held launch row publishes no result: its call's text is addressed to
    // the model, and whatever interrupts the row must be able to leave its own
    // notice as the result.
    ...(tool.result !== undefined && !tool.held ? { result: tool.result } : {}),
    ...(!suppressUserAttachmentImages && tool.images && tool.images.length > 0
      ? { images: tool.images }
      : {}),
    ...(tool.errorMessage ? { errorMessage: tool.errorMessage } : {}),
    ...(Object.keys(tool.progress).length > 0 ? { progress: tool.progress } : {}),
  };
  if (tool.itemType === "command_execution") {
    const command = readOpenCodeString(input, "command", "cmd") ?? "";
    const cwd = readOpenCodeString(input, "cwd");
    const exitCode = readOpenCodeNumber(tool.progress, "exit", "exitCode");
    return {
      ...base,
      command,
      ...(cwd ? { cwd } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
    };
  }
  if (tool.itemType === "file_change") {
    const diffSummary = tool.status === "error" ? undefined : readDiffSummary(tool.result, input);
    return {
      ...base,
      // Edit/write tools overwrite their result title with a human summary,
      // so the row anchors on the tool name like OpenCode 1 does.
      name: tool.name,
      path: readOpenCodeString(input, "filePath", "file_path", "path") ?? "",
      ...(diffSummary ? { diffSummary } : {}),
    };
  }
  if (tool.itemType === "web_search") {
    return { ...base, query: readOpenCodeString(input, "query", "q", "url") ?? "" };
  }
  if (isDelegatedLaunch(tool.name)) {
    return {
      ...base,
      name: "Agent",
      isSubAgent: true,
      ...(tool.background ? { subAgentBackground: true } : {}),
      ...(tool.subAgentStatus ? { subAgentStatus: tool.subAgentStatus } : {}),
    };
  }
  return base;
}

/** Native tool names that start a child session (`task` is the V1 spelling). */
export function isDelegatedLaunch(toolName: string): boolean {
  return ["task", "subagent"].includes(toolName.trim().toLowerCase());
}

/**
 * Absorb a finished call's typed content (`[{type:"text",text} |
 * {type:"file",uri,mime,name?}]`) into the row's `result`/`images`.
 */
export function applyOpenCodeToolContent(
  tool: OpenCodeToolItemState,
  content: ReadonlyArray<unknown> | undefined,
): void {
  if (!content || content.length === 0) return;
  const texts: string[] = [];
  const files: Array<Record<string, unknown>> = [];
  const images: string[] = [];
  for (const entry of content) {
    const record = readOpenCodeRecord(entry);
    if (!record) continue;
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
      continue;
    }
    if (record.type === "file" && typeof record.uri === "string") {
      const video = isChatVideoSource(
        record.uri,
        typeof record.mime === "string" ? record.mime : undefined,
      );
      files.push({
        type: video ? "resource_link" : "file",
        uri: record.uri,
        ...(typeof record.mime === "string"
          ? video
            ? { mimeType: record.mime }
            : { mime: record.mime }
          : {}),
        ...(typeof record.name === "string" ? { name: record.name } : {}),
      });
      // Inline `data:` images ride the canonical `images` channel so the
      // renderer can show them without a fetch; everything else stays a ref.
      if (/^data:image\//i.test(record.uri)) images.push(record.uri);
      continue;
    }
    texts.push(JSON.stringify(entry));
  }
  if (files.length > 0) {
    tool.result = [
      ...(texts.length > 0 ? [{ type: "text", text: texts.join("\n") }] : []),
      ...files,
    ];
  } else {
    tool.result = texts.join("\n");
  }
  if (images.length > 0) tool.images = [...(tool.images ?? []), ...images];
}

export function applyOpenCodeToolMetadata(
  tool: OpenCodeToolItemState,
  metadata: Record<string, unknown> | undefined,
): void {
  const progress = readOpenCodeToolProgress(metadata);
  if (progress) tool.progress = { ...tool.progress, ...progress };
}

/**
 * Keep only the progress fields the canonical payload schema understands —
 * V2 tool metadata is free-form and dumping it verbatim would hand the
 * renderer a payload it cannot validate.
 */
export function readOpenCodeToolProgress(metadata: unknown): Record<string, unknown> | undefined {
  const record = readOpenCodeRecord(metadata);
  if (!record) return undefined;
  const progress: Record<string, unknown> = {};
  const description = readOpenCodeString(record, "description", "message", "title");
  if (description) progress.description = description;
  const lastToolName = readOpenCodeString(record, "tool", "lastToolName");
  if (lastToolName) progress.lastToolName = lastToolName;
  const summary = readOpenCodeString(record, "summary");
  if (summary) progress.summary = summary;
  const tokens = readNonNegativeInteger(record["tokens"]);
  if (tokens !== undefined) progress.tokens = tokens;
  const toolUses = readNonNegativeInteger(record["toolUses"]);
  if (toolUses !== undefined) progress.toolUses = toolUses;
  const durationMs = readNonNegativeInteger(record["durationMs"]);
  if (durationMs !== undefined) progress.durationMs = durationMs;
  const stepCount = readNonNegativeInteger(record["stepCount"]);
  if (stepCount !== undefined) progress.stepCount = stepCount;
  return Object.keys(progress).length > 0 ? progress : undefined;
}

function openCodeToolKind(
  toolName: string,
): "read" | "search" | "fetch" | "execute" | "other" | undefined {
  switch (toolName.trim().toLowerCase()) {
    case "read":
    case "view":
      return "read";
    case "glob":
    case "grep":
    case "search":
      return "search";
    case "webfetch":
    case "websearch":
      return "fetch";
    case "bash":
      return "execute";
    case "question":
    case "invalid":
      return "other";
    default:
      return undefined;
  }
}

function openCodeToolTitle(toolName: string, input: Record<string, unknown> | undefined): string {
  switch (toolName.trim().toLowerCase()) {
    case "read":
    case "view":
      return readOpenCodeString(input, "filePath", "file_path", "path") ?? "Read";
    case "glob":
      return readOpenCodeString(input, "pattern", "glob") ?? "Glob";
    case "grep":
    case "search":
      return readOpenCodeString(input, "pattern", "query", "needle") ?? "Search";
    case "webfetch":
      return readOpenCodeString(input, "url") ?? "Fetch";
    case "task":
    case "subagent":
      return readOpenCodeString(input, "description", "prompt") ?? "Agent";
    default:
      return toolName;
  }
}

function openCodeToolLocations(
  toolName: string,
  input: Record<string, unknown> | undefined,
): Array<{ path: string }> | undefined {
  const name = toolName.trim().toLowerCase();
  if (name === "read" || name === "view") {
    const path = readOpenCodeString(input, "filePath", "file_path", "path");
    return path ? [{ path }] : undefined;
  }
  if (name === "grep" || name === "search") {
    const path = readOpenCodeString(input, "path");
    return path ? [{ path }] : undefined;
  }
  return undefined;
}
