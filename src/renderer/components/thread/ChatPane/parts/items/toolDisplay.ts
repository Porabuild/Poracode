import {
  Bot,
  Clock,
  Download,
  Eye,
  FilePlus,
  FolderSearch,
  GitBranch,
  Globe,
  ImageIcon,
  Pencil,
  Plug,
  SearchCode,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ToolCallPayload } from "@/shared/contracts";
import { extractLeadingPath } from "@/shared/extractLeadingPath";
import { isWorkflowTool, parseMcpName, type McpInfo } from "@/shared/toolCallClassification";
import { i18n } from "@/renderer/i18n/i18n";
import { extractAcpPatchTargetPath } from "./acpToolPayload";
import { parseWorkflowInfo } from "./workflowDisplay";

/**
 * Localize a fixed English verb used as a display prefix (e.g. "View",
 * "Edit", "Search"). Callers keep the *English* verb as the categorization /
 * round-trip token (it is compared case-insensitively against provider-supplied
 * titles) and only localize the rendered label. Unknown verbs pass through
 * unchanged so dynamically-composed verbs (e.g. "View 1:80") still render.
 */
/** Display labels keyed by the stable English verb; resolved at call time via `i18n._`. */
const verbLabels: Record<string, MessageDescriptor> = {
  View: msg`View`,
  List: msg`List`,
  Fetch: msg`Fetch`,
  Search: msg`Search`,
  Edit: msg`Edit`,
  Delete: msg`Delete`,
  Move: msg`Move`,
  Run: msg`Run`,
  Image: msg`Image`,
};

function localizeVerb(verb: string): string {
  const label = verbLabels[verb];
  if (label) return i18n._(label);
  // Dynamic verbs such as "View 1:80" keep their English line-range suffix
  // but localize the leading "View" word.
  if (verb.startsWith("View ")) return `${i18n._(verbLabels.View!)}${verb.slice("View".length)}`;
  return verb;
}

export interface ToolDisplay {
  title: string;
  Icon: LucideIcon;
  /**
   * When set, the renderer should display the title as `prefix + path` with
   * the `path` portion truncated from the start (ellipsis at the beginning),
   * so the meaningful tail of a path stays visible. When `filePath` is true
   * the path is a real filesystem path and renders as `<basename> <muted dir>`
   * with head-ellipsis on the directory.
   */
  parts?: { prefix: string; path: string; filePath?: boolean };
}

type AcpLocation = NonNullable<ToolCallPayload["locations"]>[number];

/**
 * Pick a human-readable title and icon for a `tool_call` row.
 *
 * Three input shapes are normalized:
 *   1. Claude SDK raw names (`Read`, `Grep`, `Glob`, `Task`, …) — the title is
 *      composed from the args (`View: src/foo.ts`, `Grep: "pattern"`).
 *   2. MCP tools (`mcp__<server>__<tool>` or `<server>-mcp-server-<tool>`) —
 *      shown as `<server>: <tool>` with the Plug icon.
 *   3. ACP-style human-readable titles (`Viewing src/foo.ts`, `Searching for…`)
 *      — the verb prefix selects an icon and the title is passed through.
 */
/**
 * Whether a tool_call payload represents the agent item itself. Used by the
 * timeline reducer to evict child items on completion (we keep only the final
 * result on the parent), and by the chat row router to render the sub-agent
 * pill from the moment the call starts — even before any child events arrive.
 */
export {
  isCrossagentTool,
  isDelegatedAgentTool,
  isSubAgentTool,
} from "@/shared/toolCallClassification";
export { isWorkflowTool };

export function deriveToolDisplay(payload: ToolCallPayload): ToolDisplay {
  const args = readArgsObject(payload);

  const mcp = parseMcpName(payload);
  if (mcp) {
    return { title: formatMcpTitle(mcp), Icon: Plug };
  }

  if (isSkillTool(payload)) {
    const skill = readStr(args, "skill") ?? readStr(args, "name") ?? readSkillName(payload);
    return { title: skill ? i18n._(msg`Skill: ${skill}`) : payload.name, Icon: Sparkles };
  }

  const summary = mapPersistedToolSummary(payload.name);
  if (summary) return summary;

  if (isWorkflowTool(payload)) {
    const { description } = parseWorkflowInfo(payload);
    return {
      title: description ? i18n._(msg`Workflow: ${description}`) : i18n._(msg`Workflow`),
      Icon: GitBranch,
    };
  }

  const claude = mapClaudeRawTool(payload.name, args);
  if (claude) return claude;

  if (payload.isSubAgent === true || payload.isCrossagent === true) {
    return {
      title: formatAgentTitle(args, payload.title?.trim() || payload.name.trim(), {
        preferFallback: payload.title !== undefined,
        isCrossagent: payload.isCrossagent === true,
        isResume: payload.isSubAgentResume === true,
        ...(payload.subAgentType ? { subAgentType: payload.subAgentType } : {}),
      }),
      Icon: Bot,
    };
  }

  const acp = mapAcpTool(payload, args);
  if (acp) return acp;

  return { title: payload.name, Icon: pickIconByVerbPrefix(payload.name) };
}

function mapClaudeRawTool(
  name: string,
  args: Record<string, unknown> | undefined,
): ToolDisplay | null {
  switch (name) {
    case "Read":
    case "NotebookRead":
      return withReadPath(args, ["file_path", "notebook_path"], Eye);
    case "Grep":
      return formatGrepDisplay(args);
    case "Glob":
      return withPath("Glob", args, ["pattern"], FolderSearch);
    case "LS":
    case "List":
      return withPath("List", args, ["path"], FolderSearch);
    case "Task":
    case "Agent":
      return { title: formatAgentTitle(args), Icon: Bot };
    case "BashOutput":
      return { title: titleWithValue(i18n._(msg`Bash output`), args, "bash_id"), Icon: Terminal };
    case "KillBash":
    case "KillShell":
      return {
        title: titleWithValue(i18n._(msg`Kill bash`), args, "shell_id", "bash_id"),
        Icon: Terminal,
      };
    case "ExitPlanMode":
      return { title: i18n._(msg`Exit plan mode`), Icon: Wrench };
    case "EnterPlanMode":
      return { title: i18n._(msg`Enter plan mode`), Icon: Wrench };
    case "WebFetch":
      return withPath("Fetch", args, ["url"], Globe);
    case "WebSearch":
      return { title: titleWithValue(i18n._(msg`Web search`), args, "query"), Icon: Globe };
    case "ToolSearch":
      return { title: titleWithValue(i18n._(msg`Tool search`), args, "query"), Icon: SearchCode };
    case "ScheduleWakeup":
      return formatScheduleWakeupDisplay(args);
    case "TaskCreate":
      return {
        title: titleWithValue(i18n._(msg`Create task`), args, "description"),
        Icon: FilePlus,
      };
    case "TaskList":
      return { title: i18n._(msg`List tasks`), Icon: FolderSearch };
    case "TaskGet":
      return { title: titleWithValue(i18n._(msg`Get task`), args, "id"), Icon: Eye };
    case "TaskUpdate":
      return { title: titleWithValue(i18n._(msg`Update task`), args, "id"), Icon: Pencil };
    case "TaskOutput":
      return { title: titleWithValue(i18n._(msg`Task output`), args, "id"), Icon: Terminal };
    case "TaskStop":
      return { title: titleWithValue(i18n._(msg`Stop task`), args, "id"), Icon: Trash2 };
    case "imageView":
    case "ImageView":
    case "ViewImage":
    case "Image":
      return withPath("Image", args, ["path", "file_path", "image_path", "source"], ImageIcon, {
        filePath: true,
      });
    default:
      return null;
  }
}

function withPath(
  verb: string,
  args: Record<string, unknown> | undefined,
  keys: string[],
  Icon: LucideIcon,
  options?: { filePath?: boolean },
): ToolDisplay {
  const path = readStr(args, ...keys);
  const label = localizeVerb(verb);
  if (!path) return { title: label, Icon };
  const prefix = `${label}: `;
  const parts: NonNullable<ToolDisplay["parts"]> = { prefix, path };
  if (options?.filePath) parts.filePath = true;
  return { title: `${prefix}${path}`, Icon, parts };
}

function withReadPath(
  args: Record<string, unknown> | undefined,
  keys: string[],
  Icon: LucideIcon,
): ToolDisplay {
  return withTarget(readVerb(args), readStr(args, ...keys), Icon, { filePath: true });
}

function readVerb(args: Record<string, unknown> | undefined): string {
  const range = readLineRange(args);
  return range ? `${i18n._(msg`View`)} ${range}` : i18n._(msg`View`);
}

function readLineRange(args: Record<string, unknown> | undefined): string | undefined {
  const rawStart = readInt(
    args,
    "offset",
    "line",
    "lineNumber",
    "start",
    "startLine",
    "start_line",
    "lineStart",
    "line_start",
  );
  const explicitEnd = readInt(args, "end", "endLine", "end_line", "lineEnd", "line_end");
  const limit = readInt(args, "limit");
  const start =
    rawStart !== undefined ? Math.max(1, rawStart) : limit !== undefined ? 1 : undefined;
  if (start === undefined) return undefined;
  const end =
    explicitEnd !== undefined
      ? Math.max(start, explicitEnd)
      : limit !== undefined && limit > 0
        ? start + limit - 1
        : undefined;
  return end !== undefined && end !== start ? `${start}:${end}` : `${start}`;
}

function readInt(args: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "number" && Number.isInteger(value) && Number.isFinite(value))
      return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10);
    }
  }
  return undefined;
}

function readArgsObject(payload: ToolCallPayload): Record<string, unknown> | undefined {
  const a = payload.args;
  if (!a || typeof a !== "object" || Array.isArray(a)) return undefined;
  return a as Record<string, unknown>;
}

function readStr(args: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const v = args[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function titleWithValue(
  verb: string,
  args: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  const value = readStr(args, ...keys);
  return value ? `${verb}: ${value}` : verb;
}

function formatScheduleWakeupDisplay(args: Record<string, unknown> | undefined): ToolDisplay {
  const seconds = readInt(args, "delaySeconds");
  const reason = readStr(args, "reason");
  const interval = seconds !== undefined ? formatDelaySeconds(seconds) : undefined;
  if (interval && reason) {
    return { title: i18n._(msg`Wake up in ${interval}: ${reason}`), Icon: Clock };
  }
  if (interval) return { title: i18n._(msg`Wake up in ${interval}`), Icon: Clock };
  if (reason) return { title: i18n._(msg`Wake up: ${reason}`), Icon: Clock };
  return { title: i18n._(msg`Wake up`), Icon: Clock };
}

function formatDelaySeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h${rem}m` : `${hours}h`;
}

function formatGrepDisplay(args: Record<string, unknown> | undefined): ToolDisplay {
  const pattern = readStr(args, "pattern");
  if (!pattern) return { title: "Grep", Icon: SearchCode };
  const path = readStr(args, "path");
  const glob = readStr(args, "glob");
  const scope = path ?? glob;
  if (!scope) return { title: `Grep: "${pattern}"`, Icon: SearchCode };
  const prefix = `Grep: "${pattern}" in `;
  return {
    title: `${prefix}${scope}`,
    Icon: SearchCode,
    parts: { prefix, path: scope },
  };
}

function formatAgentTitle(
  args: Record<string, unknown> | undefined,
  fallbackDescription?: string,
  options?: {
    preferFallback?: boolean;
    isCrossagent?: boolean;
    isResume?: boolean;
    subAgentType?: string;
  },
): string {
  const argsDescription = readStr(args, "description");
  const description = options?.preferFallback
    ? (fallbackDescription ?? argsDescription)
    : (argsDescription ?? fallbackDescription);
  const subagent = readSubAgentType(args) ?? options?.subAgentType;
  // A resume continues an agent that already has a row above it. Labelling it
  // "Agent" too would read as a second, unrelated agent.
  if (options?.isResume) {
    if (description) {
      return subagent
        ? i18n._(msg`Agent Resume (${subagent}): ${description}`)
        : i18n._(msg`Agent Resume: ${description}`);
    }
    return subagent ? i18n._(msg`Agent Resume: ${subagent}`) : i18n._(msg`Agent Resume`);
  }
  if (options?.isCrossagent) {
    if (description) {
      return subagent
        ? i18n._(msg`Crossagent (${subagent}): ${description}`)
        : i18n._(msg`Crossagent: ${description}`);
    }
    return subagent ? i18n._(msg`Crossagent: ${subagent}`) : i18n._(msg`Crossagent`);
  }
  if (description) {
    return subagent
      ? i18n._(msg`Agent (${subagent}): ${description}`)
      : i18n._(msg`Agent: ${description}`);
  }
  return subagent ? i18n._(msg`Agent: ${subagent}`) : i18n._(msg`Agent`);
}

function readSubAgentType(args: Record<string, unknown> | undefined): string | undefined {
  return readStr(args, "subagent_type", "agent_type", "agentType");
}

/** Recognise Droid/Codex `ApplyPatch`, `apply_patch`, `apply-patch` tool names. */
function isApplyPatchToolName(name: string): boolean {
  return /^(apply[_-]?patch)$/i.test(name.trim());
}

function mapAcpTool(
  payload: ToolCallPayload,
  args: Record<string, unknown> | undefined,
): ToolDisplay | null {
  const kind = payload.kind?.trim().toLowerCase();
  const title = payload.title?.trim() || payload.name.trim();
  const isEditByName = isApplyPatchToolName(payload.name) || isApplyPatchToolName(title);
  const locations = payload.locations ?? [];
  const locationPath = pickAcpLocationPath(kind, locations);
  const titlePath = extractLeadingPath(title);
  const argsPath = readPathArg(args);
  const patchPath =
    kind === "edit" || kind === "delete" || isEditByName
      ? extractAcpPatchTargetPath(payload)
      : undefined;
  const path = locationPath ?? argsPath ?? patchPath ?? titlePath;

  switch (kind) {
    case "read":
      return formatReadPathDisplay(path, title, args, Eye);
    case "edit":
      return formatAcpPathDisplay("Edit", path, title, Pencil);
    case "delete":
      return formatAcpPathDisplay("Delete", path, title, Trash2);
    case "move":
      return formatAcpMoveDisplay(locations, path, title);
    case "search":
      return formatAcpSearchDisplay(args, title, locationPath);
    case "fetch":
      return withTarget("Fetch", readStr(args, "url") ?? title, Globe);
    case "switch_mode":
      return {
        title: title ? i18n._(msg`Switch mode: ${title}`) : i18n._(msg`Switch mode`),
        Icon: Wrench,
      };
    case "execute":
      return {
        title: readStr(args, "command")
          ? titleWithValue(localizeVerb("Run"), args, "command")
          : `${localizeVerb("Run")}: ${title}`,
        Icon: Terminal,
      };
    case "think":
    case "other":
      if (isEditByName) return formatAcpPathDisplay("Edit", path, title, Pencil);
      return title ? { title, Icon: pickIconByVerbPrefix(title) } : null;
    default:
      if (isEditByName) return formatAcpPathDisplay("Edit", path, title, Pencil);
      return null;
  }
}

function formatReadPathDisplay(
  path: string | undefined,
  title: string,
  args: Record<string, unknown> | undefined,
  Icon: LucideIcon,
): ToolDisplay {
  const verb = readVerb(args);
  if (path) return withTarget(verb, path, Icon, { filePath: true });
  if (title.length === 0) return { title: verb, Icon };
  const readableTitle = title.replace(/^read(?:ing| file)?[:\s]+/i, "").trim() || title;
  return { title: `${verb}: ${readableTitle}`, Icon };
}

function formatMcpTitle(info: McpInfo): string {
  return `${prettyMcpServer(info.server)}: ${info.tool}`;
}

function normalizedMcpServer(server: string): string {
  return server.replace(/^claude_ai_/, "").replace(/^plugin_[^_]+_/, "");
}

/**
 * Strip common namespace prefixes that the host injects on every server name
 * (`claude_ai_<Name>`, `plugin_<vendor>_<plugin>`) and replace remaining
 * underscores with spaces so the title reads as a label, not an identifier.
 */
function prettyMcpServer(s: string): string {
  const core = normalizedMcpServer(s);
  return core.replace(/_/g, " ");
}

export function isSkillTool(payload: ToolCallPayload): boolean {
  const n = payload.name.trim();
  if (n === "Skill" || /^(loaded|using) skill\b/i.test(n)) return true;
  const args = readArgsObject(payload);
  return readStr(args, "skill") !== undefined || readSkillName(payload) !== undefined;
}

function readSkillName(payload: ToolCallPayload): string | undefined {
  const args = readArgsObject(payload);
  return (
    readSkillNameFromPath(readPathArg(args)) ??
    readSkillNameFromPath(payload.title) ??
    readSkillNameFromPath(payload.name)
  );
}

function readSkillNameFromPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/^(?:view(?:\s+\d+(?::\d+)?)?|read(?:ing)?|open(?:ing)?)[:\s]+/i, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() !== "skill.md") return undefined;
  const skillsIndex = parts.findLastIndex((part) => part.toLowerCase() === "skills");
  if (skillsIndex === -1 || skillsIndex >= parts.length - 2) return undefined;
  const skill = parts.at(-2);
  return skill && !skill.startsWith(".") ? skill : undefined;
}

function formatAcpPathDisplay(
  verb: string,
  path: string | undefined,
  title: string,
  Icon: LucideIcon,
): ToolDisplay {
  if (path) return withTarget(verb, path, Icon, { filePath: true });
  const label = localizeVerb(verb);
  if (title.length === 0) return { title: label, Icon };
  // Compare against the English `verb` token (titles are provider data) but
  // render the localized label.
  return title.toLowerCase().startsWith(verb.toLowerCase())
    ? { title, Icon }
    : { title: `${label}: ${title}`, Icon };
}

function formatAcpMoveDisplay(
  locations: readonly AcpLocation[],
  path: string | undefined,
  title: string,
): ToolDisplay {
  if (locations.length >= 2) {
    const from = locations[0]!.path;
    const to = locations[locations.length - 1]!.path;
    return { title: `${localizeVerb("Move")}: ${from} -> ${to}`, Icon: Pencil };
  }
  return formatAcpPathDisplay("Move", path, title, Pencil);
}

function formatAcpSearchDisplay(
  args: Record<string, unknown> | undefined,
  title: string,
  locationPath: string | undefined,
): ToolDisplay {
  const query = readStr(args, "query", "needle", "term");
  const pattern = readStr(args, "pattern");
  const scope = readScope(args) ?? locationPath;
  const searchTerm = query ?? pattern;
  const label = localizeVerb("Search");
  if (searchTerm) return { title: `${label}: "${searchTerm}"`, Icon: SearchCode };
  if (scope) return withTarget("Search", scope, SearchCode);
  // Compare against the English "search" token (titles are provider data).
  return title.toLowerCase().startsWith("search")
    ? { title, Icon: SearchCode }
    : { title: `${label}: ${title}`, Icon: SearchCode };
}

function pickAcpLocationPath(
  kind: string | undefined,
  locations: readonly AcpLocation[],
): string | undefined {
  if (locations.length === 0) return undefined;
  return kind === "move" ? locations[locations.length - 1]!.path : locations[0]!.path;
}

function readScope(args: Record<string, unknown> | undefined): string | undefined {
  const direct = readStr(args, "path", "glob");
  if (direct) return direct;
  const paths = args?.paths;
  if (Array.isArray(paths)) {
    const first = paths.find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (first) return first;
  }
  return undefined;
}

function readPathArg(args: Record<string, unknown> | undefined): string | undefined {
  return readStr(
    args,
    "file_path",
    "filePath",
    "path",
    "relative_path",
    "relativePath",
    "notebook_path",
    "notebookPath",
  );
}

function withTarget(
  verb: string,
  target: string | undefined,
  Icon: LucideIcon,
  options?: { filePath?: boolean },
): ToolDisplay {
  const label = localizeVerb(verb);
  if (!target) return { title: label, Icon };
  const prefix = `${label}: `;
  const parts: NonNullable<ToolDisplay["parts"]> = { prefix, path: target };
  if (options?.filePath) parts.filePath = true;
  return { title: `${prefix}${target}`, Icon, parts };
}

type ToolSummaryCategory = "viewed" | "searched" | "edited" | "executed" | "other";

const TOOL_SUMMARY_META: Record<
  ToolSummaryCategory,
  { Icon: LucideIcon; labels: readonly string[]; priority: number }
> = {
  viewed: { Icon: Eye, labels: ["view", "views"], priority: 0 },
  searched: { Icon: SearchCode, labels: ["search", "searches"], priority: 1 },
  edited: { Icon: Pencil, labels: ["edit", "edits"], priority: 2 },
  executed: { Icon: Terminal, labels: ["command", "commands"], priority: 3 },
  other: { Icon: Wrench, labels: ["tool", "tools"], priority: 4 },
};

function mapPersistedToolSummary(name: string): ToolDisplay | null {
  const category = parsePersistedToolSummaryCategory(name);
  if (!category) return null;
  return { title: name, Icon: TOOL_SUMMARY_META[category].Icon };
}

function parsePersistedToolSummaryCategory(name: string): ToolSummaryCategory | null {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const counts = new Map<ToolSummaryCategory, number>();
  for (const part of parts) {
    const match = /^(\d+)\s+([a-z]+)$/i.exec(part);
    if (!match) return null;
    const count = Number(match[1]);
    const category = categoryFromSummaryLabel(match[2]!);
    if (!Number.isFinite(count) || !category) return null;
    counts.set(category, (counts.get(category) ?? 0) + count);
  }

  return (
    [...counts.entries()].sort(
      ([aCat, aCount], [bCat, bCount]) =>
        bCount - aCount || TOOL_SUMMARY_META[aCat].priority - TOOL_SUMMARY_META[bCat].priority,
    )[0]?.[0] ?? null
  );
}

function categoryFromSummaryLabel(label: string): ToolSummaryCategory | null {
  const normalized = label.toLowerCase();
  for (const [category, meta] of Object.entries(TOOL_SUMMARY_META) as Array<
    [ToolSummaryCategory, (typeof TOOL_SUMMARY_META)[ToolSummaryCategory]]
  >) {
    if (meta.labels.includes(normalized)) return category;
  }
  return null;
}

/**
 * Verb-prefix icon resolver for ACP-style human-readable titles
 * (`Viewing src/foo.ts`, `Searching for 'bar'`). Used as a fallback for
 * payloads that don't match an MCP, Skill, or Claude raw shape.
 */
function pickIconByVerbPrefix(name: string): LucideIcon {
  const summary = parsePersistedToolSummaryCategory(name);
  if (summary) return TOOL_SUMMARY_META[summary].Icon;

  const t = name.toLowerCase().trim();
  if (t.startsWith("viewing") || t.startsWith("reading") || t.startsWith("read ")) return Eye;
  if (t.startsWith("finding files") || t.startsWith("listing")) return FolderSearch;
  if (t.startsWith("searching for") || t.startsWith("grep") || t.startsWith("searching")) {
    return SearchCode;
  }
  if (t.startsWith("downloading") || t.startsWith("download ")) return Download;
  if (t.startsWith("web search") || t.startsWith("searching the web") || t.startsWith("fetch")) {
    return Globe;
  }
  if (t.startsWith("editing") || t.startsWith("writing") || t.startsWith("patching")) return Pencil;
  if (t.startsWith("creating") || t.startsWith("adding file")) return FilePlus;
  if (t.startsWith("deleting") || t.startsWith("removing")) return Trash2;
  if (t.startsWith("running") || t.startsWith("executing") || t.startsWith("shell")) {
    return Terminal;
  }
  return Wrench;
}
