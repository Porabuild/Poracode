import type { ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { imageViewRendersInline } from "../components/thread/ChatPane/parts/items/imageViewSource";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { recordRuntimeSummarySource } from "./runtimeHistoryBoundary";

export function compactRuntimeItemsForHydration(
  items: readonly RuntimeChatItem[],
): RuntimeChatItem[] {
  const compacted: RuntimeChatItem[] = [];
  let idx = 0;
  while (idx < items.length) {
    const item = items[idx]!;
    // Error items are session-transient: they describe a failure of the run
    // that produced them, so hydrating them would resurface stale errors in
    // the composer dock every time the thread is reopened.
    if (item.type === "error" || isEmptyCompletedReasoning(item)) {
      idx += 1;
      continue;
    }
    if (!isToolGroupItem(item) || item.state !== "completed") {
      compacted.push(item);
      idx += 1;
      continue;
    }
    const run: RuntimeChatItem[] = [item];
    idx += 1;
    while (idx < items.length) {
      const next = items[idx]!;
      if (!isToolGroupItem(next) || next.state !== "completed") break;
      run.push(next);
      idx += 1;
    }
    const persistedItem =
      run.length === 1 ? normalizeToolSummaryItem(run[0]!) : summarizeToolCallRun(run);
    compacted.push(persistedItem);
  }
  return compacted;
}

function normalizeToolSummaryItem(item: RuntimeChatItem): RuntimeChatItem {
  if (!item.id.startsWith("tool-call-summary:") || item.type !== "tool_call") return item;
  const payload = item.payload as Partial<ToolCallPayload> | undefined;
  return {
    ...item,
    payload: {
      ...payload,
      name: payload?.name ?? "Tool calls",
      status: "success",
    } satisfies ToolCallPayload,
  };
}

function summarizeToolCallRun(items: readonly RuntimeChatItem[]): RuntimeChatItem {
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const summary: RuntimeChatItem = {
    id: `tool-call-summary:${first.id}:${last.id}:${items.length}`,
    type: "tool_call",
    state: "completed",
    payload: {
      name: summarizeToolCallNames(items),
      status: "success",
    } satisfies ToolCallPayload,
    streams: {},
  };
  recordRuntimeSummarySource(summary, first);
  return summary;
}

type SummaryCategory = "viewed" | "searched" | "edited" | "executed" | "other";

const CATEGORY_LABELS: Record<SummaryCategory, { singular: string; plural: string }> = {
  viewed: { singular: "view", plural: "views" },
  searched: { singular: "search", plural: "searches" },
  edited: { singular: "edit", plural: "edits" },
  executed: { singular: "command", plural: "commands" },
  other: { singular: "tool", plural: "tools" },
};

const CATEGORY_PRIORITY: Record<SummaryCategory, number> = {
  viewed: 0,
  searched: 1,
  edited: 2,
  executed: 3,
  other: 4,
};

function summarizeToolCallNames(items: readonly RuntimeChatItem[]): string {
  const counts = new Map<SummaryCategory, number>();
  for (const item of items) {
    const category = categorizeItem(item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort(
    ([aCat, aCount], [bCat, bCount]) =>
      bCount - aCount || CATEGORY_PRIORITY[aCat] - CATEGORY_PRIORITY[bCat],
  );
  const parts = sorted.map(([category, count]) => {
    const meta = CATEGORY_LABELS[category];
    return `${count} ${count === 1 ? meta.singular : meta.plural}`;
  });
  return parts.length > 0 ? parts.join(", ") : `${items.length} tools`;
}

function isToolGroupItem(item: RuntimeChatItem): boolean {
  // Sub-agent children must stay as discrete rows so the overlay can replay
  // them on reopen. Sub-agent parents carry the final result on their payload;
  // bundling either into a tool-call summary would erase that history.
  if (item.parentItemId) return false;
  if (
    item.type === "tool_call" &&
    isDelegatedAgentTool(item.payload as ToolCallPayload | undefined)
  ) {
    return false;
  }
  // Tool rows that render as a standalone inline image (ImageView) must NOT be
  // folded into a "N tools" summary: `summarizeToolCallRun` keeps only a name +
  // status, which would strip the image off the payload and lose it on reload.
  // Keep them as discrete rows so the picture survives hydration.
  if (
    (item.type === "tool_call" ||
      item.type === "mcp_tool_call" ||
      item.type === "image_view" ||
      item.type === "dynamic_tool_call") &&
    imageViewRendersInline(item.payload)
  ) {
    return false;
  }
  return (
    item.type === "tool_call" ||
    item.type === "mcp_tool_call" ||
    item.type === "image_view" ||
    item.type === "dynamic_tool_call" ||
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "web_search"
  );
}

function isEmptyCompletedReasoning(item: RuntimeChatItem): boolean {
  return (
    item.type === "reasoning" &&
    item.state === "completed" &&
    !(item.streams.reasoning_text ?? "").trim()
  );
}

function categorizeItem(item: RuntimeChatItem): SummaryCategory {
  if (item.type === "command_execution") return "executed";
  if (item.type === "file_change") return "edited";
  if (item.type === "web_search") return "searched";
  const payload = item.payload as Partial<ToolCallPayload> | undefined;
  if (!payload) return "other";
  if (isDelegatedAgentTool(payload as ToolCallPayload)) return "executed";

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

function categorizeToolName(name: string): SummaryCategory {
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

const SUMMARY_CATEGORY_LABELS: Record<SummaryCategory, readonly string[]> = {
  viewed: ["view", "views"],
  searched: ["search", "searches"],
  edited: ["edit", "edits"],
  executed: ["command", "commands"],
  other: ["tool", "tools"],
};

function categorizePersistedToolSummary(name: string): SummaryCategory | null {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const counts = new Map<SummaryCategory, number>();
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
        bCount - aCount || CATEGORY_PRIORITY[aCat] - CATEGORY_PRIORITY[bCat],
    )[0]?.[0] ?? null
  );
}

function categoryFromSummaryLabel(label: string): SummaryCategory | null {
  const normalized = label.toLowerCase();
  for (const [category, labels] of Object.entries(SUMMARY_CATEGORY_LABELS) as Array<
    [SummaryCategory, readonly string[]]
  >) {
    if (labels.includes(normalized)) return category;
  }
  return null;
}

function categorizeVerbPrefix(name: string): SummaryCategory {
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
