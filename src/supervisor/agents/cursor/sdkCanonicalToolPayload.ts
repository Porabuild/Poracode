/**
 * Defensive normalization of Cursor's intentionally unstable tool payloads.
 *
 * Cursor guarantees the call envelope but not individual tool names or
 * argument/result schemas. These readers recognize the 1.0.24 built-ins while
 * preserving unknown future tools as generic canonical tool calls.
 */

import type { CanonicalItemType, ToolCallProgress } from "@/shared/contracts";
import {
  classifyFileChangeKind,
  normalizeDiffSummaryForKind,
  type FileChangeKind,
} from "../fileChangeKind";
import { readDiffSummary, readFileChangePath, readStringField } from "../fileChangeSummary";
import type { CursorSdkToolItem } from "./sdkCanonicalMappingState";
import type { CursorSdkRawToolCall, CursorSdkTokenUsage } from "./sdkProtocol";

export interface CursorSdkToolDescriptor {
  name: string;
  classificationName: string;
  args: unknown;
}

export function descriptorFromRawTool(toolCall: CursorSdkRawToolCall): CursorSdkToolDescriptor {
  const rawArgs = toolCall.args;
  if (normalizeToolName(toolCall.type) === "mcp") {
    return {
      name: readStringField(rawArgs, "toolName", "tool_name") ?? "MCP",
      classificationName: "mcp",
      args: rawArgs,
    };
  }
  return {
    name: displayToolName(toolCall.type),
    classificationName: toolCall.type,
    args: rawArgs,
  };
}

export function descriptorFromNormalizedTool(name: string, args: unknown): CursorSdkToolDescriptor {
  return { name, classificationName: name, args };
}

export function classifyCursorSdkTool(toolName: string): CanonicalItemType {
  const name = normalizeToolName(toolName);
  if (name === "createplan" || name === "updatetodos" || name.includes("todo")) return "plan";
  if (
    name === "shell" ||
    name.includes("bash") ||
    name.includes("command") ||
    name.includes("terminal")
  ) {
    return "command_execution";
  }
  if (
    name === "write" ||
    name === "edit" ||
    name === "delete" ||
    name.includes("patch") ||
    name.includes("replace")
  ) {
    return "file_change";
  }
  if (name === "mcp" || name.startsWith("mcp")) return "mcp_tool_call";
  if (name.includes("websearch") || name.includes("webfetch")) return "web_search";
  if (name === "generateimage" || name.includes("image")) return "image_view";
  if (name === "task" || name.includes("subagent")) return "tool_call";
  return "dynamic_tool_call";
}

export function cursorSdkToolPayload(tool: CursorSdkToolItem): Record<string, unknown> {
  const args = objectValue(tool.args);
  const result = tool.result;
  const errorMessage = tool.status === "error" ? readErrorMessage(result) : undefined;

  if (tool.itemType === "command_execution") {
    const resultValue = objectValue(result);
    const exitCode = readFiniteInteger(resultValue?.exitCode);
    const durationMs = readFiniteNonNegative(resultValue?.executionTime);
    const cwd = readStringField(args, "workingDirectory", "cwd");
    return {
      command: readStringField(args, "command", "cmd") ?? tool.name,
      ...(cwd ? { cwd } : {}),
      status: tool.status,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };
  }

  if (tool.itemType === "file_change") {
    const path = readFileChangePath(args, result) ?? "";
    const diffText = readStringField(result, "diffString", "diff", "patch");
    const diffSummary = readDiffSummary(args, result, diffText);
    const changeKind = classifyCursorFileChangeKind(tool, args, result, diffText);
    return {
      name: tool.name,
      path,
      changeKind,
      status: tool.status,
      args: tool.args,
      ...(result !== undefined ? { result } : {}),
      ...(diffSummary ? { diffSummary: normalizeDiffSummaryForKind(changeKind, diffSummary) } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };
  }

  if (tool.itemType === "plan") {
    return { steps: planSteps(tool.args) };
  }

  if (tool.itemType === "web_search") {
    const resultCount = readFiniteInteger(objectValue(result)?.resultCount);
    return {
      query: readStringField(args, "query", "url") ?? tool.name,
      ...(resultCount !== undefined ? { resultCount } : {}),
    };
  }

  const kind = inferToolKind(tool.classificationName);
  const path = readFileChangePath(args);
  const serverId = readStringField(args, "providerIdentifier", "serverId", "server_id");
  const mcpArgs =
    tool.itemType === "mcp_tool_call" && args && "args" in args ? args.args : tool.args;
  const images = readToolImages(tool.classificationName, result);
  return {
    name: tool.name,
    ...(kind ? { kind } : {}),
    ...(path ? { locations: [{ path }] } : {}),
    ...(serverId ? { serverId } : {}),
    args: mcpArgs,
    ...(result !== undefined ? { result } : {}),
    status: tool.status,
    ...(tool.progress ? { progress: tool.progress } : {}),
    ...(isSubAgentTool(tool.classificationName) ? { isSubAgent: true } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function cursorSdkToolProgress(tool: CursorSdkToolItem): ToolCallProgress | undefined {
  if (!isSubAgentTool(tool.classificationName)) return tool.progress;
  const args = objectValue(tool.args);
  const result = objectValue(tool.result);
  const description = readStringField(args, "description", "prompt");
  const model = readStringField(args, "model");
  const summary = readStringField(result, "resultSuffix", "summary");
  const durationMs = readFiniteNonNegative(result?.durationMs);
  return {
    ...(description ? { description } : {}),
    ...(model ? { model } : {}),
    ...tool.progress,
    ...(summary ? { summary } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export function unwrapCursorSdkRawToolResult(result: unknown): unknown {
  const record = objectValue(result);
  if (!record) return result;
  if ("value" in record) return record.value;
  if ("error" in record) return record.error;
  return result;
}

export function cursorSdkRawToolResultIsError(result: unknown): boolean {
  const record = objectValue(result);
  return (
    record?.status === "error" ||
    record?.isError === true ||
    objectValue(record?.value)?.isError === true
  );
}

export function readCursorSdkShellOutput(value: unknown): string | undefined {
  const record = objectValue(value);
  if (!record) return typeof value === "string" && value.length > 0 ? value : undefined;
  const nested =
    objectValue(record.value) ?? objectValue(record.output) ?? objectValue(record.event);
  const source = nested ?? record;
  const stdout = readUntrimmedString(source, "stdout", "output", "text", "data", "delta", "chunk");
  const stderr = readUntrimmedString(source, "stderr");
  const combined = `${stdout ?? ""}${stderr ?? ""}`;
  return combined.length > 0 ? combined : undefined;
}

export function cursorSdkToolKey(callId: string, parentCallId?: string): string {
  return parentCallId ? `${parentCallId}/${callId}` : callId;
}

export function safeCursorSdkFingerprint(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeCursorSdkUsage(
  usage: CursorSdkTokenUsage | Omit<CursorSdkTokenUsage, "totalTokens">,
): Required<Omit<CursorSdkTokenUsage, "reasoningTokens">> & { reasoningTokens?: number } {
  const inputTokens = nonNegativeInteger(usage.inputTokens);
  const outputTokens = nonNegativeInteger(usage.outputTokens);
  const cacheReadTokens = nonNegativeInteger(usage.cacheReadTokens);
  const cacheWriteTokens = nonNegativeInteger(usage.cacheWriteTokens);
  const reasoningTokens =
    usage.reasoningTokens === undefined ? undefined : nonNegativeInteger(usage.reasoningTokens);
  const totalTokens =
    "totalTokens" in usage && typeof usage.totalTokens === "number"
      ? nonNegativeInteger(usage.totalTokens)
      : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  };
}

function planSteps(
  value: unknown,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const args = objectValue(value);
  if (Array.isArray(args?.todos)) {
    return args.todos.flatMap((todo) => {
      const item = objectValue(todo);
      const step = readStringField(item, "content", "text", "title");
      if (!step) return [];
      const rawStatus = readStringField(item, "status")?.toLowerCase();
      const status: "pending" | "in_progress" | "completed" =
        rawStatus === "completed"
          ? "completed"
          : rawStatus === "inprogress" || rawStatus === "in_progress"
            ? "in_progress"
            : "pending";
      return [{ step, status }];
    });
  }
  const plan = readStringField(args, "plan");
  if (!plan) return [];
  return plan
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#+\s*$/.test(line))
    .map((line) => {
      const completed = /^[-*]\s+\[[xX]\]\s+/.test(line);
      const inProgress = /^[-*]\s+\[[-~]\]\s+/.test(line);
      const step = line
        .replace(/^#+\s*/, "")
        .replace(/^[-*]\s+(?:\[[ xX~-]\]\s+)?/, "")
        .trim();
      const status: "pending" | "in_progress" | "completed" = completed
        ? "completed"
        : inProgress
          ? "in_progress"
          : "pending";
      return { step, status };
    })
    .filter((entry) => entry.step.length > 0);
}

function inferToolKind(
  toolName: string,
): "read" | "search" | "execute" | "fetch" | "other" | undefined {
  const name = normalizeToolName(toolName);
  if (name === "read" || name === "readlints" || name === "ls") return "read";
  if (name === "glob" || name === "grep" || name === "semsearch") return "search";
  if (name === "shell") return "execute";
  if (name.includes("fetch")) return "fetch";
  if (name === "recordscreen") return "other";
  return undefined;
}

/**
 * Classify a Cursor file change through the shared cross-provider rules so
 * structured `changes`, diff/patch evidence and explicit kind fields behave
 * exactly as they do for the other providers.
 *
 * Cursor's tool names carry real intent that the shared kind/title fallback
 * cannot see (`write` creates or overwrites, `delete` removes), so a confident
 * name reading is injected as a low-priority source: concrete payload evidence
 * still wins, but the name beats the generic "default to edit" fallback.
 * The name hint is deliberately consulted before the loosely typed `diffString`
 * text, which would otherwise flip a `write`/`delete` badge to "edit" the
 * moment the completion snapshot arrives.
 */
function classifyCursorFileChangeKind(
  tool: CursorSdkToolItem,
  args: Record<string, unknown> | undefined,
  result: unknown,
  diffText: string | undefined,
): FileChangeKind {
  const nameKind = fileChangeKindFromToolName(tool.classificationName);
  return classifyFileChangeKind(
    tool.classificationName,
    tool.name,
    args,
    result,
    ...(nameKind ? [{ changeKind: nameKind }] : []),
    diffText,
  );
}

function fileChangeKindFromToolName(toolName: string): FileChangeKind | undefined {
  const name = normalizeToolName(toolName);
  if (name === "write" || name.includes("create")) return "create";
  if (name === "delete" || name.includes("remove")) return "delete";
  return undefined;
}

function isSubAgentTool(toolName: string): boolean {
  const name = normalizeToolName(toolName);
  return name === "task" || name.includes("subagent");
}

function displayToolName(name: string): string {
  const labels: Record<string, string> = {
    createPlan: "Create Plan",
    generateImage: "Generate Image",
    readLints: "Read Lints",
    recordScreen: "Record Screen",
    semSearch: "Semantic Search",
    updateTodos: "Update Todos",
  };
  return labels[name] ?? name;
}

function readToolImages(toolName: string, result: unknown): string[] {
  const value = objectValue(result);
  const images: string[] = [];
  if (normalizeToolName(toolName) === "generateimage") {
    const data = readUntrimmedString(value, "imageData");
    if (data) images.push(asDataUrl(data, "image/png"));
  }
  if (Array.isArray(value?.content)) {
    for (const content of value.content) {
      const image = objectValue(objectValue(content)?.image);
      const data = readUntrimmedString(image, "data");
      if (!data) continue;
      images.push(asDataUrl(data, readStringField(image, "mimeType") ?? "image/png"));
    }
  }
  return images;
}

function asDataUrl(data: string, mimeType: string): string {
  return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
}

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readUntrimmedString(value: unknown, ...keys: string[]): string | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  const record = objectValue(value);
  if (!record) return undefined;
  return (
    readStringField(record, "message", "errorMessage", "error") ??
    readErrorMessage(record.error) ??
    readErrorMessage(record.value)
  );
}

function readFiniteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function readFiniteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}
