import { Eye, Pencil, SearchCode, Terminal, Wrench, type LucideIcon } from "lucide-react";
import type {
  CommandExecutionPayload,
  FileChangePayload,
  ToolCallPayload,
} from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { extractAcpDiffSummary, readAcpStringField } from "./acpToolPayload";
import { commandIntentDisplay } from "./commandSummary";
import { isContextCompactionToolCall } from "./ContextCompaction";
import { isPlanProposalToolCall } from "./PlanProposal";
import { deriveToolDisplay, isSubAgentTool } from "./toolDisplay";

export type GroupCategory = "viewed" | "searched" | "edited" | "executed" | "other";

export interface CategoryMeta {
  Icon: LucideIcon;
  singular: string;
  plural: string;
  /** Tiebreaker when two categories share a count — lower wins. */
  priority: number;
}

export const CATEGORY_META: Record<GroupCategory, CategoryMeta> = {
  viewed: { Icon: Eye, singular: "view", plural: "views", priority: 0 },
  searched: { Icon: SearchCode, singular: "search", plural: "searches", priority: 1 },
  edited: { Icon: Pencil, singular: "edit", plural: "edits", priority: 2 },
  executed: { Icon: Terminal, singular: "command", plural: "commands", priority: 3 },
  other: { Icon: Wrench, singular: "tool", plural: "tools", priority: 4 },
};

export interface GroupSection {
  category: GroupCategory;
  count: number;
  label: string;
  Icon: LucideIcon;
}

export interface SameFileEditGroupSummary {
  count: number;
  path: string;
  diffSummary?: NonNullable<FileChangePayload["diffSummary"]>;
}

export function summarizeToolCalls(items: readonly RuntimeChatItem[]): GroupSection[] {
  const counts = new Map<GroupCategory, number>();
  for (const item of items) {
    const category = categorizeItem(item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      ([aCat, aCount], [bCat, bCount]) =>
        bCount - aCount || CATEGORY_META[aCat].priority - CATEGORY_META[bCat].priority,
    )
    .map(([category, count]) => {
      const meta = CATEGORY_META[category];
      return {
        category,
        count,
        label: count === 1 ? meta.singular : meta.plural,
        Icon: meta.Icon,
      };
    });
}

export function summarizeSameFileEditGroup(
  items: readonly RuntimeChatItem[],
): SameFileEditGroupSummary | null {
  if (items.length <= 1) return null;

  let sharedPath: string | undefined;
  let added = 0;
  let removed = 0;
  let hasDiffSummary = false;
  let missingDiffSummary = false;

  for (const item of items) {
    if (categorizeItem(item) !== "edited") return null;
    const path = readEditGroupPath(item);
    if (!path) return null;
    if (sharedPath === undefined) {
      sharedPath = path;
    } else if (normalizeEditGroupPath(sharedPath) !== normalizeEditGroupPath(path)) {
      return null;
    }

    const diffSummary = readEditDiffSummary(item);
    if (diffSummary) {
      hasDiffSummary = true;
      added += diffSummary.added;
      removed += diffSummary.removed;
    } else {
      missingDiffSummary = true;
    }
  }

  if (!sharedPath) return null;
  return {
    count: items.length,
    path: sharedPath,
    ...(hasDiffSummary && !missingDiffSummary ? { diffSummary: { added, removed } } : {}),
  };
}

export function readEditGroupPath(item: RuntimeChatItem): string | undefined {
  if (item.type === "file_change") {
    const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
    return payload?.path && payload.path.length > 0 ? payload.path : undefined;
  }
  if (!isToolLikeItem(item)) return undefined;
  const payload = getToolLikePayload(item);
  if (!payload) return undefined;
  const display = deriveToolDisplay(payload);
  if (display.parts?.filePath && display.parts.path.length > 0) return display.parts.path;
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

export function readEditDiffSummary(
  item: RuntimeChatItem,
): NonNullable<FileChangePayload["diffSummary"]> | undefined {
  if (item.type === "file_change") {
    const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
    return payload?.diffSummary ?? extractAcpDiffSummary(payload);
  }
  if (!isToolLikeItem(item)) return undefined;
  const payload = getToolLikePayload(item);
  return payload && isEditLikeToolPayload(payload) ? extractAcpDiffSummary(payload) : undefined;
}

export function normalizeEditGroupPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function isToolGroupItem(item: RuntimeChatItem): boolean {
  if (isContextCompactionToolCall(item)) return false;
  if (isPlanProposalToolCall(item)) return false;
  return (
    isToolLikeItem(item) ||
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "web_search"
  );
}

export function categorizeItem(item: RuntimeChatItem): GroupCategory {
  if (item.type === "command_execution") return categorizeCommandExecution(item);
  if (item.type === "file_change") return "edited";
  if (item.type === "web_search") return "searched";
  const payload = getToolLikePayload(item);
  if (!payload) return "other";
  if (isSubAgentTool(payload)) return "executed";

  switch (payload.kind) {
    case "read":
      return "viewed";
    case "search":
    case "fetch":
      return "searched";
    case "edit":
    case "delete":
    case "move":
      return "edited";
    case "execute":
      return "executed";
  }

  const summary = categorizePersistedToolSummary(payload.name ?? "");
  if (summary) return summary;

  const byName = categorizeToolName(payload.name ?? "");
  if (byName !== "other") return byName;
  return categorizeVerbPrefix(payload.name ?? "");
}

export function isToolLikeItem(item: RuntimeChatItem): boolean {
  return (
    item.type === "tool_call" ||
    item.type === "mcp_tool_call" ||
    item.type === "image_view" ||
    item.type === "dynamic_tool_call"
  );
}

export function getToolLikePayload(item: RuntimeChatItem): ToolCallPayload | undefined {
  return isToolLikeItem(item) ? (item.payload as ToolCallPayload | undefined) : undefined;
}

export function categorizeCommandExecution(item: RuntimeChatItem): GroupCategory {
  const payload = getRuntimeItemPayload<CommandExecutionPayload>(item, "command_execution");
  const command = readCommandPayloadCommand(payload);
  if (!command) return "executed";
  switch (commandIntentDisplay(command).kind) {
    case "view":
    case "list":
      return "viewed";
    case "search":
      return "searched";
    default:
      return "executed";
  }
}

export function readCommandPayloadCommand(payload: CommandExecutionPayload | undefined): string {
  return payload?.command && payload.command.length > 0
    ? payload.command
    : (readAcpStringField(payload, "command") ?? "");
}

export function categorizeToolName(name: string): GroupCategory {
  switch (name) {
    case "Read":
    case "NotebookRead":
      return "viewed";
    case "Grep":
    case "Glob":
    case "LS":
    case "List":
    case "WebSearch":
    case "WebFetch":
    case "ToolSearch":
      return "searched";
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
    case "Patch":
    case "ApplyPatch":
    case "apply_patch":
      return "edited";
    case "Bash":
    case "BashOutput":
    case "KillBash":
    case "KillShell":
      return "executed";
    default:
      return "other";
  }
}

export const SUMMARY_CATEGORY_LABELS: Record<GroupCategory, readonly string[]> = {
  viewed: ["view", "views"],
  searched: ["search", "searches"],
  edited: ["edit", "edits"],
  executed: ["command", "commands"],
  other: ["tool", "tools"],
};

export function categorizePersistedToolSummary(name: string): GroupCategory | null {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const counts = new Map<GroupCategory, number>();
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
        bCount - aCount || CATEGORY_META[aCat].priority - CATEGORY_META[bCat].priority,
    )[0]?.[0] ?? null
  );
}

export function categoryFromSummaryLabel(label: string): GroupCategory | null {
  const normalized = label.toLowerCase();
  for (const [category, labels] of Object.entries(SUMMARY_CATEGORY_LABELS) as Array<
    [GroupCategory, readonly string[]]
  >) {
    if (labels.includes(normalized)) return category;
  }
  return null;
}

export function isEditLikeToolPayload(payload: ToolCallPayload): boolean {
  switch (payload.kind) {
    case "edit":
    case "delete":
    case "move":
      return true;
  }
  return categorizeToolName(payload.name) === "edited";
}

export function categorizeVerbPrefix(name: string): GroupCategory {
  const t = name.toLowerCase().trim();
  if (t.startsWith("viewing") || t.startsWith("reading") || t.startsWith("read ")) return "viewed";
  if (
    t.startsWith("searching") ||
    t.startsWith("finding") ||
    t.startsWith("grep") ||
    t.startsWith("listing") ||
    t.startsWith("fetch")
  ) {
    return "searched";
  }
  if (
    t.startsWith("editing") ||
    t.startsWith("writing") ||
    t.startsWith("patching") ||
    t.startsWith("creating") ||
    t.startsWith("deleting") ||
    t.startsWith("removing")
  ) {
    return "edited";
  }
  if (t.startsWith("running") || t.startsWith("executing") || t.startsWith("shell")) {
    return "executed";
  }
  return "other";
}
