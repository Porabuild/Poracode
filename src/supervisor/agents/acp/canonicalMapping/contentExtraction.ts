/**
 * Leaf extractors for the ACP → canonical mapper.
 *
 * Pure, provider-agnostic helpers that pull typed fields out of ACP's loosely
 * typed `rawInput`/`rawOutput`/`content` shapes and classify tool kinds. No
 * mapper state is touched here.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import { readFileChangePath } from "../../fileChangeSummary";

export function normalizeToolText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

export function extractToolLocations(
  locations: Array<{ path?: string | null; line?: number | null }> | null | undefined,
): Array<{ path: string; line?: number }> {
  if (!Array.isArray(locations)) return [];
  return locations.flatMap((location) => {
    const path = normalizeToolText(location?.path);
    if (!path) return [];
    const line = typeof location?.line === "number" ? location.line : undefined;
    return [{ path, ...(line != null ? { line } : {}) }];
  });
}

export function extractFileChangePath(
  input: unknown,
  title: string | undefined,
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  return (
    readFileChangePath(input) ?? readToolLocationPath(kind, locations) ?? readFileChangePath(title)
  );
}

function readToolLocationPath(
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  if (locations.length === 0) return undefined;
  const lowerKind = (kind ?? "").toLowerCase();
  return lowerKind === "move" ? locations[locations.length - 1]?.path : locations[0]?.path;
}

/** Recognise Droid/Codex `ApplyPatch`, `apply_patch`, `apply-patch` tool names. */
export function isApplyPatchToolName(name: string): boolean {
  return /^(apply[_-]?patch)$/i.test(name.trim());
}

/**
 * Classify ACP tool kind/title into a canonical item type for richer rendering.
 * - command-style tool calls → command_execution
 * - file-edit / write tool calls → file_change
 * - web search tool calls → web_search
 * - everything else → tool_call
 */
export function classifyToolCallItemType(
  kind: string | null | undefined,
  title: string | null | undefined,
  locations?: Array<{ path?: string | null; line?: number | null }> | null,
): CanonicalItemType {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (k === "execute" || k === "shell" || /^(run|exec|shell)\b/.test(t)) return "command_execution";
  if (
    k === "edit" ||
    k === "delete" ||
    k === "move" ||
    isApplyPatchToolName(k) ||
    /\b(edit|write|create|delete|patch|move|rename)\b/.test(t) ||
    isApplyPatchToolName(t)
  ) {
    return "file_change";
  }
  if (k === "search") {
    return extractToolLocations(locations).length > 0 || !isWebSearchTitle(t)
      ? "tool_call"
      : "web_search";
  }
  if (isWebSearchTitle(t)) return "web_search";
  return "tool_call";
}

function isWebSearchTitle(title: string): boolean {
  return /\b(web[_ ]search|search(?:ing)? the web|internet search|search online)\b/.test(title);
}

/**
 * Pull text from an ACP `ToolCallContent[]` collection. ACP carries tool
 * output as one of:
 *   - `{ type: "content", content: { type: "text", text } }` — inline text
 *   - `{ type: "terminal", terminalId }` — reference to a client-hosted PTY,
 *     used by Gemini's run_shell_command tool. The session passes a resolver
 *     so we can inline that PTY's current captured stdout/stderr.
 * Diff blocks are left to richer renderers and skipped at this layer.
 *
 * Pass `terminalIdHint` when the caller knows the PTY id from earlier updates
 * but the current notification omits the `content` array — Gemini sends the
 * terminal reference on the initial `tool_call` and may not repeat it on
 * status-only `tool_call_update`s.
 */
export function extractToolCallContentText(
  content: unknown,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  terminalIdHint?: string,
): string | undefined {
  const parts: string[] = [];
  const seenTerminals = new Set<string>();
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.type === "terminal") {
        const terminalId = typeof e.terminalId === "string" ? e.terminalId : undefined;
        if (!terminalId || !resolveTerminalOutput) continue;
        seenTerminals.add(terminalId);
        const out = resolveTerminalOutput(terminalId);
        if (out && out.length > 0) parts.push(out);
        continue;
      }
      if (e.type !== "content") continue;
      const inner = e.content;
      if (!inner || typeof inner !== "object") continue;
      const block = inner as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
        parts.push(block.text);
      }
    }
  }
  if (terminalIdHint && resolveTerminalOutput && !seenTerminals.has(terminalIdHint)) {
    const out = resolveTerminalOutput(terminalIdHint);
    if (out && out.length > 0) parts.push(out);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Optional context that lets {@link extractToolCallContentImages} recover
 * images an agent referenced instead of inlining. All fields are optional: with
 * an empty context the extractor is exactly the inline-base64-only function it
 * has always been.
 */
export interface ToolCallImageContext {
  /** ACP tool `kind` — gates the `locations` fallback to read-kind calls. */
  kind?: string | null | undefined;
  /** Canonical tool-call status — the `locations` fallback waits for success. */
  status?: "running" | "success" | "error" | undefined;
  /** Normalized tool-call locations (see {@link extractToolLocations}). */
  locations?: readonly { path: string }[] | undefined;
  /**
   * Session-injected reader that turns a `file://` URI or absolute path into a
   * `data:` URL, or `undefined` when the file is unreadable/too large/not an
   * image. Pure mapping code never touches the filesystem itself.
   */
  resolveLocalImage?: ((pathOrFileUri: string) => string | undefined) | undefined;
}

/**
 * Collect images from an ACP tool result's `ToolCallContent[]` as renderable
 * `data:` URLs. ACP carries images as
 * `{ type: "content", content: { type: "image", data: "<base64>", mimeType } }`
 * — `extractToolCallContentText` keeps only text, so this preserves the picture
 * for the renderer's inline image card.
 *
 * Three sources, in order, all deduped against each other:
 *  1. inline base64 `data` on an image block (always honored);
 *  2. an image block that carries only a `uri` and no `data` — resolved through
 *     `context.resolveLocalImage` when the session supplied one;
 *  3. for a completed `read`-kind call that produced no image content at all,
 *     the tool call's `locations` — the only place such agents name the file
 *     they just viewed. Kind-gated so a write/search call that happens to
 *     mention an image path never grows an image card.
 */
export function extractToolCallContentImages(
  content: unknown,
  context: ToolCallImageContext = {},
): string[] {
  const images: string[] = [];
  const seen = new Set<string>();
  const seenSources = new Set<string>();
  const push = (dataUrl: string | undefined): void => {
    if (!dataUrl || seen.has(dataUrl)) return;
    seen.add(dataUrl);
    images.push(dataUrl);
  };
  const resolveSource = (source: string): void => {
    if (!context.resolveLocalImage || seenSources.has(source)) return;
    seenSources.add(source);
    push(context.resolveLocalImage(source));
  };
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.type !== "content") continue;
      const inner = e.content;
      if (!inner || typeof inner !== "object") continue;
      const block = inner as Record<string, unknown>;
      if (block.type !== "image") continue;
      if (typeof block.data === "string" && block.data.length > 0) {
        const mime = typeof block.mimeType === "string" ? block.mimeType : "image/png";
        push(`data:${mime};base64,${block.data}`);
        continue;
      }
      const uri = normalizeToolText(typeof block.uri === "string" ? block.uri : undefined);
      if (uri) resolveSource(uri);
    }
  }
  if (
    images.length === 0 &&
    context.status === "success" &&
    (context.kind ?? "").toLowerCase() === "read"
  ) {
    for (const location of context.locations ?? []) resolveSource(location.path);
  }
  return images;
}

/**
 * Detect ACP tool calls that represent a todo/plan write operation.
 *
 * ACP agents that expose a `todo_write` / `todowrite` / `TodoWrite` tool
 * (the same shape Claude and OpenCode use) may not emit a separate `plan`
 * session update. Without this detection the plan dock would never reflect
 * status changes made through the tool call path.
 */
export function isAcpTodoWriteTool(
  title: string | null | undefined,
  kind: string | null | undefined,
  name?: string | null,
): boolean {
  const t = (title ?? "").toLowerCase().trim();
  const k = (kind ?? "").toLowerCase().trim();
  const n = (name ?? "").toLowerCase().trim();
  return (
    t === "todo_write" ||
    t === "todowrite" ||
    k === "todo_write" ||
    k === "todowrite" ||
    n === "todo_write" ||
    n === "todowrite"
  );
}

/**
 * Detect ACP tool calls that represent the cross-provider `ExitPlanMode`
 * plan-review convention (same names Claude and the renderer's plan-approval
 * detection use).
 */
export function isAcpExitPlanModeTool(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").trim().toLowerCase();
  const k = (kind ?? "").trim().toLowerCase();
  return (
    t === "exitplanmode" || t === "exit_plan_mode" || k === "exitplanmode" || k === "exit_plan_mode"
  );
}

/**
 * Detect ACP tool calls that represent the cross-provider `EnterPlanMode`
 * convention — the counterpart of {@link isAcpExitPlanModeTool}.
 */
export function isAcpEnterPlanModeTool(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").trim().toLowerCase();
  const k = (kind ?? "").trim().toLowerCase();
  return (
    t === "enterplanmode" ||
    t === "enter_plan_mode" ||
    k === "enterplanmode" ||
    k === "enter_plan_mode"
  );
}

export interface AcpPlanReviewContent {
  plan: string;
  planFilePath?: string;
}

/**
 * Parse the plan body out of an ExitPlanMode approval's text content.
 *
 * ACP plan-review bridges (e.g. Kimi's acp-server) send the plan as a text
 * block of the form `"Plan saved to: <path>\n\n<plan markdown>"` (the path
 * prefix is optional) and append a trailing human summary line
 * (`"Requesting approval to …"`). Returns `undefined` when no plan body
 * remains after stripping that summary.
 */
export function parseAcpPlanReviewText(text: string | undefined): AcpPlanReviewContent | undefined {
  if (!text) return undefined;
  const body = text.replace(/\n+Requesting approval to [^\n]*$/i, "").trim();
  if (!body || /^Requesting approval to /i.test(body)) return undefined;
  const saved = /^Plan saved to:\s*(\S[^\n]*?)\s*\r?\n\r?\n([\s\S]*)$/.exec(body);
  if (saved) {
    const plan = saved[2]!.trim();
    if (!plan) return undefined;
    return { plan, planFilePath: saved[1]! };
  }
  return { plan: body };
}

/**
 * Extract canonical plan steps from a `todo_write` tool's `rawInput`.
 *
 * The input shape mirrors Claude's `TodoWrite`: `{ todos: [{ content, status }] }`.
 * Returns an empty array when the input is unrecognisable so callers can
 * fall through to the default tool-call rendering.
 */
export function extractAcpTodoWriteSteps(
  rawInput: unknown,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return [];
  const input = rawInput as Record<string, unknown>;
  const todos = input.todos;
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

const BULLET_TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[(?<marker>[ xX~>])\]\s+)?(?<text>.+?)\s*$/;

/**
 * Parse plan steps from a markdown string (the `plan_update` `markdown`
 * content variant). Recognises bullet/numbered lists with optional checkbox
 * markers: `- [x] done`, `- [ ] todo`, `- plain`.
 */
export function parsePlanMarkdownSteps(
  markdown: string,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  if (!markdown.trim()) return [];
  const steps: Array<{ step: string; status: "pending" | "in_progress" | "completed" }> = [];
  for (const rawLine of markdown.split(/\r?\n/g)) {
    const match = BULLET_TASK_RE.exec(rawLine);
    if (!match?.groups?.text) continue;
    const text = match.groups.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const marker = match.groups.marker;
    const status =
      marker?.toLowerCase() === "x"
        ? "completed"
        : marker === "~" || marker === ">"
          ? "in_progress"
          : "pending";
    steps.push({ step: text, status });
  }
  return steps;
}
