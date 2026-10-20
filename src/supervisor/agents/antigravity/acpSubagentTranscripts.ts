/**
 * Antigravity `localharness` transcript parsing (`transcript_full.jsonl`).
 *
 * The harness writes one JSON object per line; steps carry `step_index`,
 * `type` (`PLANNER_RESPONSE`, `INVOKE_SUBAGENT`, `GENERIC`, `SYSTEM_MESSAGE`,
 * `ERROR_MESSAGE`, ...), `status` (`DONE` while streaming variants exist),
 * optional token counters, `created_at`, and planner `tool_calls`. Malformed
 * lines are skipped so a torn write never breaks a live session.
 *
 * Parsed here, consumed by `acpSubagents.ts` — kept apart so the bridge file
 * stays focused on lifecycle and mapping state.
 */

import type { ToolKind } from "@agentclientprotocol/sdk";

export interface TranscriptToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TranscriptStep {
  step_index: number;
  type: string;
  status?: string;
  thinking?: string;
  content?: string;
  created_at?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  tool_calls?: TranscriptToolCall[];
}

export interface SubagentSpec {
  role?: string;
  typeName: string;
  prompt?: string;
  model?: string;
}

const CREATED_SUBAGENT_BLOCK_RE = /\{[^{}]*"conversationId"\s*:\s*"[^"]+"[^{}]*\}/g;

export function parseTranscriptSteps(raw: string): TranscriptStep[] {
  const steps: TranscriptStep[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const rec = asRecord(parsed);
    if (!rec) continue;
    const stepIndex = typeof rec.step_index === "number" ? rec.step_index : undefined;
    const type = typeof rec.type === "string" ? rec.type : undefined;
    if (stepIndex === undefined || !type) continue;

    const toolCalls = Array.isArray(rec.tool_calls)
      ? rec.tool_calls
          .map((item) => parseTranscriptToolCall(item))
          .filter((item): item is TranscriptToolCall => item !== undefined)
      : undefined;

    steps.push({
      step_index: stepIndex,
      type,
      ...(typeof rec.status === "string" ? { status: rec.status } : {}),
      ...(typeof rec.thinking === "string" ? { thinking: rec.thinking } : {}),
      ...(typeof rec.content === "string" ? { content: rec.content } : {}),
      ...(typeof rec.created_at === "string" ? { created_at: rec.created_at } : {}),
      ...(typeof rec.input_tokens === "number" ? { input_tokens: rec.input_tokens } : {}),
      ...(typeof rec.output_tokens === "number" ? { output_tokens: rec.output_tokens } : {}),
      ...(typeof rec.cache_read_tokens === "number"
        ? { cache_read_tokens: rec.cache_read_tokens }
        : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    });
  }
  return steps;
}

function parseTranscriptToolCall(raw: unknown): TranscriptToolCall | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const name = readNonEmptyString(rec, "name");
  if (!name) return undefined;
  const rawArgs = asRecord(rec.args) ?? {};
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawArgs)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          // Only structured payloads replace the raw string; a string result
          // means the quotes were literal content (e.g. a quoted CommandLine).
          if (typeof parsed !== "string") {
            args[key] = parsed;
            continue;
          }
        } catch {
          // Keep original string when not valid JSON.
        }
      }
    }
    args[key] = value;
  }
  return { name, args };
}

export function parseInvokeSubagentSpecs(args: Record<string, unknown>): SubagentSpec[] {
  const rawSubagents = args.Subagents ?? args.subagents;
  if (!Array.isArray(rawSubagents)) return [];
  const specs: SubagentSpec[] = [];
  for (const item of rawSubagents) {
    const rec = asRecord(item);
    if (!rec) continue;
    const role = readNonEmptyString(rec, "Role") ?? readNonEmptyString(rec, "role");
    const typeName =
      readNonEmptyString(rec, "TypeName") ?? readNonEmptyString(rec, "type") ?? "research";
    const prompt = readNonEmptyString(rec, "Prompt") ?? readNonEmptyString(rec, "prompt");
    const rawModel = readNonEmptyString(rec, "Model") ?? readNonEmptyString(rec, "model");
    const model = rawModel && rawModel.toLowerCase() !== "inherit" ? rawModel : undefined;
    specs.push({
      typeName,
      ...(role ? { role } : {}),
      ...(prompt ? { prompt } : {}),
      ...(model ? { model } : {}),
    });
  }
  return specs;
}

export function parseCreatedSubagents(
  content: string,
): Array<{ conversationId: string; logAbsoluteUri?: string }> {
  const created: Array<{ conversationId: string; logAbsoluteUri?: string }> = [];
  for (const match of content.matchAll(CREATED_SUBAGENT_BLOCK_RE)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      continue;
    }
    const rec = asRecord(parsed);
    if (!rec) continue;
    const conversationId = readNonEmptyString(rec, "conversationId");
    if (!conversationId) continue;
    const logAbsoluteUri = readNonEmptyString(rec, "logAbsoluteUri");
    created.push({
      conversationId,
      ...(logAbsoluteUri ? { logAbsoluteUri } : {}),
    });
  }
  return created;
}

interface MappedChildToolCall {
  kind: ToolKind;
  title: string;
  description: string;
  rawInput: Record<string, unknown>;
  locations?: Array<{ path: string; line?: number }>;
}

export function mapChildTranscriptToolCall(tc: TranscriptToolCall): MappedChildToolCall {
  const { name, args } = tc;
  const toolSummary = readNonEmptyString(args, "toolSummary");
  const toolAction = readNonEmptyString(args, "toolAction");

  if (
    name === "view_file" ||
    name === "client_view_file" ||
    name === "list_dir" ||
    name === "view_file_outline" ||
    name === "view_code_item"
  ) {
    const path =
      readNonEmptyString(args, "AbsolutePath") ??
      readNonEmptyString(args, "absolute_path") ??
      readNonEmptyString(args, "DirectoryPath") ??
      readNonEmptyString(args, "File");
    const line =
      typeof args.StartLine === "number"
        ? args.StartLine
        : typeof args.offset === "number"
          ? args.offset
          : undefined;
    const title = toolSummary ?? toolAction ?? (path ? `Read ${path}` : name);
    return {
      kind: "read",
      title,
      description: toolAction ?? title,
      rawInput: {
        ...args,
        _toolName: name,
        ...(path ? { file_path: path, path } : {}),
      },
      ...(path ? { locations: [{ path, ...(line !== undefined ? { line } : {}) }] } : {}),
    };
  }

  if (
    name === "write_to_file" ||
    name === "replace_file_content" ||
    name === "multi_replace_file_content" ||
    name === "client_edit_file"
  ) {
    const path = readNonEmptyString(args, "TargetFile") ?? readNonEmptyString(args, "file_path");
    const title = toolSummary ?? toolAction ?? (path ? `Edit ${path}` : name);
    return {
      kind: "edit",
      title,
      description: toolAction ?? title,
      rawInput: {
        ...args,
        _toolName: name,
        ...(path ? { file_path: path, path } : {}),
      },
      ...(path ? { locations: [{ path }] } : {}),
    };
  }

  if (name === "run_command" || name === "command_status" || name === "send_command_input") {
    const command = readNonEmptyString(args, "CommandLine") ?? readNonEmptyString(args, "command");
    const cwd = readNonEmptyString(args, "Cwd") ?? readNonEmptyString(args, "cwd");
    const title = command ? `Run: ${command}` : (toolSummary ?? toolAction ?? name);
    return {
      kind: "execute",
      title,
      description: toolAction ?? toolSummary ?? title,
      rawInput: {
        ...args,
        _toolName: name,
        ...(command ? { command } : {}),
        ...(cwd ? { cwd } : {}),
      },
    };
  }

  if (name === "grep_search" || name === "find_by_name") {
    const query = readNonEmptyString(args, "Query") ?? readNonEmptyString(args, "Pattern");
    const searchPath =
      readNonEmptyString(args, "SearchPath") ?? readNonEmptyString(args, "SearchDirectory");
    const title = toolSummary ?? toolAction ?? (query ? `Search: ${query}` : name);
    return {
      kind: "search",
      title,
      description: toolAction ?? title,
      rawInput: {
        ...args,
        _toolName: name,
        ...(query ? { pattern: query, query } : {}),
        ...(searchPath ? { path: searchPath } : {}),
      },
      ...(searchPath ? { locations: [{ path: searchPath }] } : {}),
    };
  }

  const title = toolSummary ?? toolAction ?? name;
  return {
    kind: "other",
    title,
    description: toolAction ?? title,
    rawInput: {
      ...args,
      _toolName: name,
    },
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readNonEmptyString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
