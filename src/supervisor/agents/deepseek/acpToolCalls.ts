/**
 * DeepSeek Harness ACP `session/update` normalization.
 *
 * The harness's ACP bridge is automation-only: it forwards every committed tool
 * call as `title: <tool name>`, `kind: "other"` and the model-facing
 * `rawInput`. It never forwards the presentation metadata its own tools declare
 * (`presentCall`: kind, human title, file locations), so the shared ACP mapper
 * only sees "bash", "read", "grep", … and the renderer paints anonymous
 * generic rows with a wrench icon.
 *
 * This provider-owned transform restores the presentation facts the shared
 * mapper and renderer already understand, before canonical mapping:
 *  - a canonical ACP `kind` (execute/read/edit/search/fetch) so the row gets
 *    the right item type, icon, category, and command/read/search renderer;
 *  - file `locations` for read/edit/write tools so view rows can follow the
 *    file and late image/read results resolve;
 *  - the harness's `queries` argument as the canonical `query` for
 *    `web_search`;
 *  - a human title for tools that have no richer ACP kind.
 *
 * It is pure, never throws, and only touches `tool_call` notifications. It
 * leaves a notification alone once the harness sends a meaningful `kind`; a
 * programmatic `name`, when present, still recovers presentation facts even if
 * the title is already human-readable.
 * Tool identities, routing, and model-facing arguments stay intact: `name`
 * keeps the harness's programmatic tool name and only display-only aliases are
 * added to `rawInput`.
 */

import type { SessionNotification, ToolCallLocation, ToolKind } from "@agentclientprotocol/sdk";

type ToolInput = Record<string, unknown>;

interface DeepSeekToolPresentation {
  kind?: ToolKind;
  title?: string;
  locations?: ToolCallLocation[];
  /** Display-only additions for canonical extraction; execution is unaffected. */
  rawInput?: ToolInput;
}

export function transformDeepSeekAcpSessionUpdate(
  notification: SessionNotification,
): SessionNotification {
  const update = notification.update;
  if (update.sessionUpdate !== "tool_call") return notification;
  // A meaningful ACP kind is the provider speaking for itself; preserve it.
  if (update.kind !== undefined && update.kind !== null && update.kind !== "other") {
    return notification;
  }
  const titleName = readToolName(update.title);
  if (titleName && isMcpToolName(titleName)) return notification;
  const toolName = readToolName(update.name) ?? titleName;
  if (!toolName || isMcpToolName(toolName)) return notification;
  const args = readRecord(update.rawInput);
  const presentation = presentDeepSeekTool(toolName, args);
  if (!presentation) return notification;
  const programmaticName = update.name?.trim();
  return {
    ...notification,
    update: {
      ...update,
      name: programmaticName || toolName,
      ...(presentation.kind ? { kind: presentation.kind } : {}),
      ...(presentation.title ? { title: presentation.title } : {}),
      ...(presentation.locations && presentation.locations.length > 0
        ? { locations: presentation.locations }
        : {}),
      ...(presentation.rawInput ? { rawInput: presentation.rawInput } : {}),
    },
  };
}

/**
 * Tool names registered by the harness's built-in tool plugins.
 *
 * Titles deliberately avoid ACP classification trigger words (`create`,
 * `write`, `run`, …) unless the tool really is that kind: the shared mapper
 * classifies `tool_call` rows from `kind` first and then title keywords.
 */
function presentDeepSeekTool(
  toolName: string,
  args: ToolInput | undefined,
): DeepSeekToolPresentation | undefined {
  switch (toolName) {
    case "bash":
    case "pwsh": {
      const workdir = readString(args, "workdir", "cwd");
      return {
        kind: "execute",
        ...(workdir && args && readString(args, "cwd") === undefined
          ? { rawInput: { ...args, cwd: workdir } }
          : {}),
      };
    }
    case "read": {
      const path = readString(args, "file_path");
      return withFile("read", "Read", path, readLine(args));
    }
    case "read_image": {
      const path = readString(args, "file_path");
      return withFile("read", "Read image", path, undefined);
    }
    case "edit": {
      const path = readString(args, "file_path");
      return withFile("edit", "Edit", path, undefined);
    }
    case "write": {
      const path = readString(args, "file_path");
      return withFile("edit", "Write", path, undefined);
    }
    case "apply_patch": {
      return { kind: "edit", title: applyPatchTitle(readString(args, "input")) };
    }
    case "str_replace_editor": {
      const path = readString(args, "path");
      const command = readString(args, "command");
      if (command === "view") return withFile("read", "View", path, undefined);
      const insertLine = readInteger(args, "insert_line");
      const line =
        command === "insert" && insertLine !== undefined ? Math.max(1, insertLine + 1) : undefined;
      return withFile("edit", command === "create" ? "Create" : "Edit", path, line);
    }
    case "grep": {
      const pattern = readString(args, "pattern");
      return { kind: "search", title: pattern ? `Grep ${pattern}` : "Grep" };
    }
    case "glob": {
      const pattern = readString(args, "pattern");
      return { kind: "search", title: pattern ? `Glob ${pattern}` : "Glob" };
    }
    case "web_search": {
      const query = readQueries(args);
      return {
        kind: "search",
        title: query ? `Web search: ${query}` : "Web search",
        ...(query && args ? { rawInput: { ...args, query } } : {}),
      };
    }
    case "web_fetch": {
      const url = readString(args, "url");
      return { kind: "fetch", title: url ? `Fetch ${url}` : "Fetch" };
    }
    case "session_search":
      return { kind: "search", title: readSearchTitle(args, "Search prior sessions") };
    case "session_event_search":
      return { kind: "search", title: readSearchTitle(args, "Search session events") };
    case "session_trace": {
      const sessionId = readString(args, "session_id");
      return { title: sessionId ? `Trace session ${sessionId}` : "Trace current session" };
    }
    case "session_event_trace": {
      const seq = readNumber(args, "seq");
      return { title: seq !== undefined ? `Trace event ${seq}` : "Trace session event" };
    }
    case "session_event_read": {
      const seq = readNumber(args, "seq");
      return { title: seq !== undefined ? `Session event ${seq}` : "Session event" };
    }
    case "todo_write":
      return { title: "Update todo list" };
    case "skill": {
      const skill = readString(args, "name");
      return { title: skill ? `Load skill ${skill}` : "Load skill" };
    }
    case "subagent": {
      const description = readString(args, "description");
      return { title: description ? `Subagent: ${description}` : "Subagent" };
    }
    case "list_agents":
      return { title: "List agents" };
    case "list_subagent_models":
      return { title: "List subagent models" };
    case "send_message":
      return { title: withArg("Send message to", args, "agent") };
    case "wait_agent":
      return { title: "Wait for input" };
    case "interrupt_agent":
      return { title: withArg("Interrupt agent", args, "agent") };
    case "team_task_create":
      return { title: "New team task" };
    case "team_task_list":
      return { title: "List team tasks" };
    case "team_task_get":
      return { title: withArg("Get team task", args, "task_id") };
    case "team_task_update":
      return { title: withArg("Update team task", args, "task_id") };
    case "get_goal":
      return { title: "Current goal" };
    case "create_goal":
      return { title: "Set goal" };
    case "update_goal":
      return { title: "Update goal" };
    case "job_output":
      return { title: withArg("Background job output", args, "job_id") };
    case "job_list":
      return { title: "List background jobs" };
    case "job_kill":
      return { title: withArg("Kill background job", args, "job_id") };
    case "schedule_create":
      return { title: "Schedule new task" };
    case "schedule_list":
      return { title: "List scheduled tasks" };
    case "schedule_view":
      return { title: withArg("Scheduled task", args, "id") };
    case "schedule_edit":
      return { title: withArg("Update scheduled task", args, "id") };
    case "terminal_open": {
      const terminal = readString(args, "name") ?? readString(args, "type");
      return { title: terminal ? `Open terminal ${terminal}` : "Open terminal" };
    }
    case "terminal_list":
      return { title: "List terminals" };
    case "terminal_read":
      return { title: withArg("Terminal output", args, "sessionId") };
    case "terminal_send":
      return { title: withArg("Send to terminal", args, "sessionId") };
    case "terminal_close":
      return { title: withArg("Close terminal", args, "sessionId") };
    case "terminal_signal":
      return { title: withArg("Signal terminal", args, "sessionId") };
    case "ask_user_question":
      return { title: "Ask user" };
    case "present":
      return { title: "Present" };
    case "working_directory": {
      const cd = readString(args, "cd");
      return { title: cd ? `Change working directory to ${cd}` : "Working directory" };
    }
    case "load_workspace_dependencies":
      return { title: "Load workspace dependencies" };
    case "office_render": {
      const input = readString(args, "input");
      return { title: input ? `Render ${input}` : "Render document" };
    }
    case "office_convert": {
      const input = readString(args, "input");
      const format = readString(args, "format");
      return {
        title: input ? `Convert ${input}${format ? ` to ${format}` : ""}` : "Convert document",
      };
    }
    case "office_recalculate": {
      const input = readString(args, "input");
      const format = readString(args, "format");
      return {
        title: input
          ? `Recalculate ${input}${format ? ` as ${format}` : ""}`
          : "Recalculate spreadsheet",
      };
    }
    case "ralph":
      return { title: "Ralph" };
    default:
      return undefined;
  }
}

function applyPatchTitle(patch: string | undefined): string {
  if (!patch) return "Apply patch";
  const adds = /^\*\*\*\s+Add File:/m.test(patch);
  const deletes = /^\*\*\*\s+Delete File:/m.test(patch);
  const updates = /^\*\*\*\s+(?:Update|Move) File:/m.test(patch);
  if (adds && !deletes && !updates) return "Create patch";
  if (deletes && !adds && !updates) return "Delete patch";
  return "Apply patch";
}

function withFile(
  kind: ToolKind,
  verb: string,
  path: string | undefined,
  line: number | undefined,
): DeepSeekToolPresentation {
  if (!path) return { kind, title: verb };
  return {
    kind,
    title: `${verb} ${path}`,
    locations: [{ path, ...(line !== undefined ? { line } : {}) }],
  };
}

function readLine(args: ToolInput | undefined): number | undefined {
  const offset = readNumber(args, "offset");
  return offset !== undefined && offset > 0 ? offset : undefined;
}

function readSearchTitle(args: ToolInput | undefined, fallback: string): string {
  const query = readString(args, "query");
  return query ? `${fallback}: ${query}` : fallback;
}

function withArg(prefix: string, args: ToolInput | undefined, key: string): string {
  const value = readString(args, key);
  return value ? `${prefix} ${value}` : prefix;
}

function readQueries(args: ToolInput | undefined): string | undefined {
  const queries = args?.queries;
  if (!Array.isArray(queries)) return readString(args, "query");
  const values = queries.filter(
    (query): query is string => typeof query === "string" && query.trim().length > 0,
  );
  return values.length > 0 ? values.join(", ") : undefined;
}

function readToolName(title: string | null | undefined): string | undefined {
  if (typeof title !== "string") return undefined;
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  // DSH titles are bare tool identifiers; a future harness may send a
  // human-readable title instead, which this transform leaves alone.
  return /^[a-z][a-z0-9_-]*$/.test(trimmed) ? trimmed : undefined;
}

function isMcpToolName(toolName: string): boolean {
  return /^mcp__.+?__/.test(toolName) || /-mcp-server-/.test(toolName);
}

function readString(args: ToolInput | undefined, ...keys: string[]): string | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readNumber(args: ToolInput | undefined, key: string): number | undefined {
  const value = readInteger(args, key);
  return value !== undefined && value > 0 ? value : undefined;
}

function readInteger(args: ToolInput | undefined, key: string): number | undefined {
  const value = args?.[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRecord(value: unknown): ToolInput | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ToolInput)
    : undefined;
}
