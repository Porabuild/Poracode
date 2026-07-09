/**
 * Cursor-specific ACP `session/update` normalization.
 *
 * Why this exists: Cursor's ACP server sends near-empty `tool_call` payloads —
 * `rawInput` is `{}` for everything except `execute`, `locations` is never
 * populated, and tool results arrive on `rawOutput` as a structured object
 * (`{ content }`, `{ stdout, stderr, exitCode }`, `{ totalMatches }`, …) rather
 * than as text `content[]` blocks. The shared canonical mapper then surfaces
 * those objects as raw JSON in the chat accordion body, which is what the
 * "View shows {content: …}" / "git diff result empty" / "grep result {totalMatches:N}"
 * symptoms come from.
 *
 * This module is the Cursor adapter's bridge. It recovers missing tool labels
 * from Cursor metadata and rewrites structured `rawOutput` into a text
 * representation the renderer's existing extractors already handle correctly
 * (string results → `asPart` → plain/JSON/diff detection). It is wired only into
 * the Cursor adapter's `createStructuredSession()` and never touches shared
 * mapping code.
 *
 * The transform is intentionally narrow:
 *  - It only mutates `tool_call` / `tool_call_update` notifications.
 *  - It preserves provider fields except for recovered task metadata, missing
 *    `title`/`kind`, and formatted `rawOutput`.
 *  - It is pure (no IO, no state) and never throws.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { buildLineUnifiedDiff } from "@/shared/lineUnifiedDiff";

export function transformCursorAcpSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  const update = notification.update;
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") {
    return notification;
  }
  const enriched = enrichCursorToolCall(update);
  const rawOutput = (enriched as { rawOutput?: unknown }).rawOutput;
  if (!isPlainRecord(rawOutput)) {
    return enriched === update ? notification : { ...notification, update: enriched };
  }
  const kind = readString((enriched as { kind?: unknown }).kind)?.toLowerCase();
  const replacement = formatRawOutput(kind, rawOutput);
  if (replacement === undefined) {
    return enriched === update ? notification : { ...notification, update: enriched };
  }
  return {
    ...notification,
    update: { ...enriched, rawOutput: replacement } as SessionNotification["update"],
  };
}

function enrichCursorToolCall(
  update: SessionNotification["update"],
): SessionNotification["update"] {
  return enrichCursorToolCallLabel(enrichCursorTaskToolCall(update));
}

/**
 * Cursor's near-empty initial `tool_call` events frequently omit both `title`
 * and `kind`, but carry the real tool identity on `rawInput._toolName`
 * (e.g. `"read_file"`, `"grep"`). Without a label the shared mapper would emit a
 * nameless (now deferred/hidden) row until a later update fills it in — so
 * derive an immediate human title, and a canonical `kind` for a confident set of
 * tool names so `classifyToolCallItemType` picks the right row type/icon. This
 * is provider-specific: `_toolName` never leaks into shared ACP code. A
 * pre-existing meaningful `title`/`kind` is always preserved.
 */
function enrichCursorToolCallLabel(
  update: SessionNotification["update"],
): SessionNotification["update"] {
  const tool = update as { title?: unknown; kind?: unknown; rawInput?: unknown };
  const rawInput = tool.rawInput;
  if (!isPlainRecord(rawInput)) return update;
  const toolName = readString(rawInput._toolName);
  if (!toolName) return update;
  const derivedTitle = readString(tool.title) ? undefined : humanizeCursorToolName(toolName);
  const derivedKind = readString(tool.kind) ? undefined : cursorKindFromToolName(toolName);
  if (!derivedTitle && !derivedKind) return update;
  return {
    ...update,
    ...(derivedTitle ? { title: derivedTitle } : {}),
    ...(derivedKind ? { kind: derivedKind } : {}),
  } as SessionNotification["update"];
}

/** Humanize a Cursor tool name while preserving MCP namespace identity. */
function humanizeCursorToolName(name: string): string {
  if (/^mcp__.+?__.+$/.test(name) || /^.+?-mcp-server-.+$/.test(name)) return name;
  const spaced = name.replace(/[_-]+/g, " ").trim();
  if (spaced.length === 0) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Map a confident subset of Cursor `_toolName`s to a canonical ACP tool `kind`
 * so the row gets the right type/icon before real metadata arrives. Anything
 * uncertain is left unset (the mapper falls back to the generic bucket).
 */
function cursorKindFromToolName(name: string): string | undefined {
  switch (name.toLowerCase()) {
    case "read":
    case "read_file":
      return "read";
    case "grep":
    case "grep_search":
    case "glob":
    case "file_search":
    case "codebase_search":
    case "list_dir":
      return "search";
    case "shell":
    case "bash":
    case "terminal":
    case "run_terminal_cmd":
      return "execute";
    case "edit_file":
    case "write":
    case "create_file":
    case "search_replace":
      return "edit";
    case "delete_file":
      return "delete";
    default:
      return undefined;
  }
}

function enrichCursorTaskToolCall(
  update: SessionNotification["update"],
): SessionNotification["update"] {
  const toolUpdate = update as {
    rawInput?: unknown;
    title?: unknown;
  };
  const rawInput = toolUpdate.rawInput;
  if (!isPlainRecord(rawInput) || rawInput._toolName !== "task") return update;
  const title = readString(toolUpdate.title);
  const fromTitle = title?.replace(/^Task:\s*/i, "").trim();
  const description =
    readString(rawInput.description) ??
    (fromTitle && fromTitle.toLowerCase() !== "subagent task" ? fromTitle : undefined);
  if (!description && readString(rawInput.prompt)) return update;
  if (!description) return update;
  return {
    ...update,
    rawInput: {
      ...rawInput,
      description,
      name: readString(rawInput.name) ?? description,
      ...(readString(rawInput.prompt) ? {} : { prompt: description }),
    },
  } as SessionNotification["update"];
}

function formatRawOutput(
  kind: string | undefined,
  rawOutput: Record<string, unknown>,
): string | undefined {
  // Cursor surfaces tool failures as `{ error: "<message>" }` regardless of
  // tool kind (hook blocks, permission denials, runtime errors). Always
  // unwrap so the chat row shows the message instead of `{"error":"..."}`.
  const error = readString(rawOutput.error);
  if (error) return error;

  switch (kind) {
    case "read":
      return formatReadOutput(rawOutput);
    case "execute":
      return formatExecuteOutput(rawOutput);
    case "search":
      return formatSearchOutput(rawOutput);
    case "edit":
    case "delete":
    case "move":
      return formatEditOutput(rawOutput);
    default:
      return undefined;
  }
}

function formatReadOutput(rawOutput: Record<string, unknown>): string | undefined {
  // Cursor's read tool returns `{ content: "<full file body>" }`.
  return readString(rawOutput.content) ?? readString(rawOutput.text);
}

function formatExecuteOutput(rawOutput: Record<string, unknown>): string | undefined {
  const stdout = readString(rawOutput.stdout) ?? "";
  const stderr = readString(rawOutput.stderr) ?? "";
  const exitCode = readNumber(rawOutput.exitCode);
  const parts: string[] = [];
  if (stdout.length > 0) parts.push(stdout);
  if (typeof exitCode === "number" && exitCode !== 0) parts.push(`[exit ${exitCode}]`);
  if (stderr.length > 0) parts.push(`[stderr]\n${stderr}`);
  if (parts.length === 0) {
    return stdout.length > 0 ? stdout : "(no output)";
  }
  return parts.join("\n");
}

function formatSearchOutput(rawOutput: Record<string, unknown>): string | undefined {
  const lines: string[] = [];

  const matches = Array.isArray(rawOutput.matches) ? rawOutput.matches : undefined;
  if (matches && matches.length > 0) {
    for (const entry of matches) {
      if (!isPlainRecord(entry)) continue;
      const path = readString(entry.path) ?? readString(entry.file) ?? "?";
      const line = readNumber(entry.line) ?? readNumber(entry.lineNumber);
      const snippet =
        readString(entry.content) ?? readString(entry.preview) ?? readString(entry.text);
      if (line !== undefined && snippet) lines.push(`${path}:${line}: ${snippet}`);
      else if (line !== undefined) lines.push(`${path}:${line}`);
      else if (snippet) lines.push(`${path}: ${snippet}`);
      else lines.push(path);
    }
  } else {
    const files = Array.isArray(rawOutput.files) ? rawOutput.files : undefined;
    if (files && files.length > 0) {
      for (const entry of files) {
        if (typeof entry === "string") {
          lines.push(entry);
        } else if (isPlainRecord(entry)) {
          const path = readString(entry.path) ?? readString(entry.file);
          if (path) lines.push(path);
        }
      }
    }
  }

  const total = readNumber(rawOutput.totalMatches) ?? readNumber(rawOutput.totalFiles);
  const truncated = rawOutput.truncated === true;

  if (lines.length > 0) {
    if (truncated && total !== undefined && total > lines.length) {
      return `${lines.join("\n")}\n[…${total} total, truncated]`;
    }
    return lines.join("\n");
  }
  if (total !== undefined) {
    return truncated ? `${total} results (truncated)` : `${total} results`;
  }
  return undefined;
}

function formatEditOutput(rawOutput: Record<string, unknown>): string | undefined {
  // Prefer a ready-made unified diff Cursor sometimes attaches.
  const diff = readString(rawOutput.diff) ?? readString(rawOutput.unifiedDiff);
  if (diff) return diff;
  const path =
    readString(rawOutput.path) ?? readString(rawOutput.filePath) ?? readString(rawOutput.file_path);
  const oldText =
    readString(rawOutput.oldText) ??
    readString(rawOutput.old_text) ??
    readString(rawOutput.oldString) ??
    readString(rawOutput.old_string) ??
    "";
  const newText =
    readString(rawOutput.newText) ??
    readString(rawOutput.new_text) ??
    readString(rawOutput.newString) ??
    readString(rawOutput.new_string);
  if (!path || newText === undefined) return undefined;
  return buildLineUnifiedDiff(path, oldText, newText);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
