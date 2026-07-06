/**
 * Tool-name → canonical item type / display metadata classification for
 * OpenCode tool calls.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import { readStringField } from "../../fileChangeSummary";
import { normalizeToolName, readOpenCodePath } from "./readers";

export function classifyToolItemType(toolName: string): CanonicalItemType {
  const n = normalizeToolName(toolName);
  // OpenCode's todo tool is named `todowrite` (the legacy `todoread` may also
  // surface). Route both into the canonical `plan` item so the renderer picks
  // it up via `ThreadTodoDock` instead of a generic tool accordion.
  if (n === "todowrite" || n === "todoread") return "plan";
  if (/(^|[_-])bash($|[_-])|(^|[_-])shell($|[_-])|(^|[_-])command($|[_-])/.test(n)) {
    return "command_execution";
  }
  if (/(^|[_-])(create|edit|write|patch|multiedit)($|[_-])/.test(n)) {
    return "file_change";
  }
  if (/(^|[_-])(webfetch|websearch)($|[_-])/.test(n)) {
    return "web_search";
  }
  return "tool_call";
}

export function openCodeToolKind(
  toolName: string,
): "read" | "search" | "fetch" | "execute" | "other" | undefined {
  switch (normalizeToolName(toolName)) {
    case "read":
    case "view":
      return "read";
    case "glob":
    case "grep":
    case "search":
      return "search";
    case "webfetch":
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

export function openCodeToolTitle(
  toolName: string,
  input: Record<string, unknown> | undefined,
  stateTitle: string | undefined,
): string {
  const title = stateTitle?.trim();
  if (title) return title;

  switch (normalizeToolName(toolName)) {
    case "read":
    case "view":
      return readOpenCodePath(input) ?? "Read";
    case "glob":
      return readStringField(input, "pattern", "glob") ?? "Glob";
    case "search":
    case "grep": {
      const pattern = readStringField(input, "pattern", "query", "needle");
      const scope = readStringField(input, "path", "glob", "include");
      if (pattern && scope) return `"${pattern}" in ${scope}`;
      return pattern ?? (normalizeToolName(toolName) === "search" ? "Search" : "Grep");
    }
    case "webfetch":
      return readStringField(input, "url") ?? "Fetch";
    case "skill":
      return readStringField(input, "skill", "name") ?? "Skill";
    case "task":
      return readStringField(input, "description", "prompt") ?? "Agent";
    default:
      return toolName;
  }
}

export function openCodeToolLocations(
  toolName: string,
  input: Record<string, unknown> | undefined,
): Array<{ path: string }> | undefined {
  const n = normalizeToolName(toolName);
  if (n === "read" || n === "view") {
    const path = readOpenCodePath(input);
    return path ? [{ path }] : undefined;
  }
  if (n === "grep" || n === "search") {
    const path = readStringField(input, "path");
    return path ? [{ path }] : undefined;
  }
  return undefined;
}

/**
 * Extract canonical plan steps from a `todowrite` tool's input. OpenCode's
 * tool input mirrors Claude's: `{ todos: [{ content, status, priority }] }`.
 * Anything we can't recognise is dropped — empty `steps` results in an empty
 * dock entry, which the renderer treats as "no plan yet".
 */
export function extractOpenCodePlanSteps(
  input: Record<string, unknown> | undefined,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const todos = input?.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    if (!todo || typeof todo !== "object") return [];
    const obj = todo as Record<string, unknown>;
    const step =
      typeof obj.content === "string" && obj.content.trim().length > 0
        ? obj.content.trim()
        : "Task";
    const status =
      obj.status === "completed"
        ? "completed"
        : obj.status === "in_progress"
          ? "in_progress"
          : "pending";
    return [{ step, status }];
  });
}
