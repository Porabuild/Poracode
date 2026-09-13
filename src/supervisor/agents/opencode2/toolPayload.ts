/**
 * Tool-call mapping for the OpenCode 2 canonical mapper: item classification,
 * the canonical row payload, and result/metadata absorption.
 *
 * Mirrors OpenCode 1's `canonicalMapping/toolPayload.ts`: every payload
 * carries `name`/`status` (plus `args`/`result` once known) so the unified
 * accordion body can surface the full request/response, with canonical
 * type-specific fields (`command`, `path`, `query`) layered on top.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import { readNonNegativeInteger } from "../contextUsage";
import { readOpenCode2Number, readOpenCode2Record, readOpenCode2String } from "./readers";

export interface OpenCode2ToolItemState {
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
}

export function createOpenCode2ToolItem(itemId: string, toolName: string): OpenCode2ToolItemState {
  return {
    itemId,
    itemType: classifyOpenCode2ToolItemType(toolName),
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
function classifyOpenCode2ToolItemType(toolName: string): CanonicalItemType {
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
export function openCode2ToolPayload(tool: OpenCode2ToolItemState): Record<string, unknown> {
  const input = tool.input;
  const title = openCode2ToolTitle(tool.name, input);
  const kind = openCode2ToolKind(tool.name);
  const locations = openCode2ToolLocations(tool.name, input);
  const base: Record<string, unknown> = {
    name: title,
    status: tool.status,
    ...(title !== tool.name ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations ? { locations } : {}),
    ...(input !== undefined ? { args: input } : {}),
    ...(tool.result !== undefined ? { result: tool.result } : {}),
    ...(tool.images && tool.images.length > 0 ? { images: tool.images } : {}),
    ...(tool.errorMessage ? { errorMessage: tool.errorMessage } : {}),
    ...(Object.keys(tool.progress).length > 0 ? { progress: tool.progress } : {}),
  };
  if (tool.itemType === "command_execution") {
    const command = readOpenCode2String(input, "command", "cmd") ?? "";
    const cwd = readOpenCode2String(input, "cwd");
    const exitCode = readOpenCode2Number(tool.progress, "exit", "exitCode");
    return {
      ...base,
      command,
      ...(cwd ? { cwd } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
    };
  }
  if (tool.itemType === "file_change") {
    return {
      ...base,
      // Edit/write tools overwrite their result title with a human summary,
      // so the row anchors on the tool name like OpenCode 1 does.
      name: tool.name,
      path: readOpenCode2String(input, "filePath", "file_path", "path") ?? "",
    };
  }
  if (tool.itemType === "web_search") {
    return { ...base, query: readOpenCode2String(input, "query", "q", "url") ?? "" };
  }
  if (["task", "subagent"].includes(tool.name.trim().toLowerCase())) {
    return { ...base, name: "Agent", isSubAgent: true };
  }
  return base;
}

/**
 * Absorb a finished call's typed content (`[{type:"text",text} |
 * {type:"file",uri,mime,name?}]`) into the row's `result`/`images`.
 */
export function applyOpenCode2ToolContent(
  tool: OpenCode2ToolItemState,
  content: ReadonlyArray<unknown> | undefined,
): void {
  if (!content || content.length === 0) return;
  const texts: string[] = [];
  const files: Array<Record<string, unknown>> = [];
  const images: string[] = [];
  for (const entry of content) {
    const record = readOpenCode2Record(entry);
    if (!record) continue;
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
      continue;
    }
    if (record.type === "file" && typeof record.uri === "string") {
      files.push({
        type: "file",
        uri: record.uri,
        ...(typeof record.mime === "string" ? { mime: record.mime } : {}),
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

export function applyOpenCode2ToolMetadata(
  tool: OpenCode2ToolItemState,
  metadata: Record<string, unknown> | undefined,
): void {
  const progress = readOpenCode2ToolProgress(metadata);
  if (progress) tool.progress = { ...tool.progress, ...progress };
}

/**
 * Keep only the progress fields the canonical payload schema understands —
 * V2 tool metadata is free-form and dumping it verbatim would hand the
 * renderer a payload it cannot validate.
 */
export function readOpenCode2ToolProgress(metadata: unknown): Record<string, unknown> | undefined {
  const record = readOpenCode2Record(metadata);
  if (!record) return undefined;
  const progress: Record<string, unknown> = {};
  const description = readOpenCode2String(record, "description", "message", "title");
  if (description) progress.description = description;
  const lastToolName = readOpenCode2String(record, "tool", "lastToolName");
  if (lastToolName) progress.lastToolName = lastToolName;
  const summary = readOpenCode2String(record, "summary");
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

function openCode2ToolKind(
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

function openCode2ToolTitle(toolName: string, input: Record<string, unknown> | undefined): string {
  switch (toolName.trim().toLowerCase()) {
    case "read":
    case "view":
      return readOpenCode2String(input, "filePath", "file_path", "path") ?? "Read";
    case "glob":
      return readOpenCode2String(input, "pattern", "glob") ?? "Glob";
    case "grep":
    case "search":
      return readOpenCode2String(input, "pattern", "query", "needle") ?? "Search";
    case "webfetch":
      return readOpenCode2String(input, "url") ?? "Fetch";
    case "task":
    case "subagent":
      return readOpenCode2String(input, "description", "prompt") ?? "Agent";
    default:
      return toolName;
  }
}

function openCode2ToolLocations(
  toolName: string,
  input: Record<string, unknown> | undefined,
): Array<{ path: string }> | undefined {
  const name = toolName.trim().toLowerCase();
  if (name === "read" || name === "view") {
    const path = readOpenCode2String(input, "filePath", "file_path", "path");
    return path ? [{ path }] : undefined;
  }
  if (name === "grep" || name === "search") {
    const path = readOpenCode2String(input, "path");
    return path ? [{ path }] : undefined;
  }
  return undefined;
}
