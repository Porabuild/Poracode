import type { ThreadContextUsage, ToolCallPayload } from "@/shared/contracts";
import { captureRendererException } from "../diagnostics/sentry";
import { imageViewRendersInline } from "../components/thread/ChatPane/parts/items/imageViewSource";
import { isSubAgentTool } from "../components/thread/ChatPane/parts/items/toolDisplay";
import { readBridge } from "../bridge";
import { useAppStore } from "./appStore";
import {
  subscribeRuntimePersistenceDirtyThreads,
  type CompletedTurnRecord,
  type RuntimeChatItem,
} from "./slices/runtimeEventSlice";

const FLUSH_DEBOUNCE_MS = 300;
const hydratedThreadRuntimeIds = new Set<string>();
const pendingThreadRuntimeHydrations = new Map<string, Promise<boolean>>();

/**
 * Persists per-thread canonical chat items to SQLite so the UI can hydrate
 * after an app restart. Subscribes to runtime item ids / maps, diffs by
 * reference, and debounce-flushes per thread.
 *
 * Designed for "fire-and-forget" persistence: missing a write under heavy
 * load is fine because the next event triggers another flush. We only persist
 * canonical items plus completed-turn markers (not requests) since requests
 * are ephemeral and resolve within a turn.
 */
interface PendingFlush {
  items: RuntimeChatItem[];
  turns: ReadonlyArray<CompletedTurnRecord>;
  contextUsage: ThreadContextUsage | null;
}

interface CompactedRuntimeItems {
  items: RuntimeChatItem[];
  anchorRemap: ReadonlyMap<string, string | null>;
}

export function prepareRuntimeSnapshotForPersistence(
  items: readonly RuntimeChatItem[],
  turns: ReadonlyArray<CompletedTurnRecord>,
): {
  items: RuntimeChatItem[];
  turns: CompletedTurnRecord[];
} {
  const compacted = compactRuntimeItemsForPersistence(items);
  return {
    items: compacted.items,
    turns: remapCompletedTurnAnchors(turns, compacted.anchorRemap),
  };
}

export function hasHydratedThreadRuntimeItems(threadId: string): boolean {
  return (
    hydratedThreadRuntimeIds.has(threadId) ||
    Object.prototype.hasOwnProperty.call(useAppStore.getState().runtimeItemIdsByThread, threadId)
  );
}

export function installRuntimeItemsPersister(): () => void {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingThreadIds = new Set<string>();

  const flushThread = (threadId: string) => {
    pendingTimers.delete(threadId);
    if (!pendingThreadIds.delete(threadId)) return;
    const snapshot = collectPendingFlush(threadId);
    if (!snapshot) return;
    const persisted = prepareRuntimeSnapshotForPersistence(snapshot.items, snapshot.turns);
    const bridge = readBridge();
    void bridge
      .dbReplaceThreadRuntimeSnapshot({
        threadId,
        items: persisted.items.map((item) => ({
          id: item.id,
          type: item.type,
          state: item.state,
          payload: item.payload,
          streams: item.streams as Record<string, string>,
          ...(item.parentItemId ? { parentItemId: item.parentItemId } : {}),
        })),
        turns: persisted.turns.map((turn) => ({
          startedAt: new Date(turn.startedAt).toISOString(),
          endedAt: new Date(turn.endedAt).toISOString(),
          anchorItemId: turn.anchorItemId,
        })),
        contextUsage: snapshot.contextUsage,
      })
      .catch((err: unknown) => {
        console.warn("[chat] failed to persist runtime snapshot for thread %s", threadId, err);
        captureRendererException(err, { featureArea: "runtime-persistence" });
      });
  };

  const scheduleFlush = (threadId: string) => {
    pendingThreadIds.add(threadId);
    const existing = pendingTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => flushThread(threadId), FLUSH_DEBOUNCE_MS);
    pendingTimers.set(threadId, timer);
  };

  const unsubscribe = subscribeRuntimePersistenceDirtyThreads((dirtyThreadIds) => {
    for (const threadId of dirtyThreadIds) {
      scheduleFlush(threadId);
    }
  });

  return () => {
    unsubscribe();
    // Drain pending debounced writes rather than dropping them, so the last
    // items of a turn that just finished are not lost if teardown happens
    // within the debounce window.
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    for (const threadId of [...pendingThreadIds]) flushThread(threadId);
  };
}

function collectPendingFlush(threadId: string): PendingFlush | null {
  const state = useAppStore.getState();
  const ids = state.runtimeItemIdsByThread[threadId];
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  const turns = state.runtimeCompletedTurnsByThread[threadId] ?? [];
  const contextUsage = state.runtimeContextByThread[threadId] ?? null;
  return {
    items: (ids ?? [])
      .map((itemId) => itemsById?.[itemId])
      .filter((item): item is RuntimeChatItem => !!item),
    turns,
    contextUsage,
  };
}

/**
 * Fetch persisted items for a thread and seed the Zustand store. Called on
 * `ChatPane` mount so reopening a thread shows past messages even after an
 * app restart.
 */
export async function hydrateThreadRuntimeItems(threadId: string): Promise<void> {
  if (hydratedThreadRuntimeIds.has(threadId)) return;
  const pending = pendingThreadRuntimeHydrations.get(threadId);
  if (pending) {
    await pending;
    return;
  }

  const hydration = hydrateThreadRuntimeItemsFromDb(threadId);
  pendingThreadRuntimeHydrations.set(threadId, hydration);
  try {
    const completed = await hydration;
    if (completed) {
      hydratedThreadRuntimeIds.add(threadId);
    }
  } finally {
    pendingThreadRuntimeHydrations.delete(threadId);
  }
}

async function hydrateThreadRuntimeItemsFromDb(threadId: string): Promise<boolean> {
  const bridge = readBridge();
  const [itemsResult, turnsResult, contextResult] = await Promise.allSettled([
    Promise.resolve().then(() => bridge.dbGetThreadRuntimeItems(threadId)),
    Promise.resolve().then(() => bridge.dbGetThreadCompletedTurns(threadId)),
    Promise.resolve().then(() => bridge.dbGetThreadContextUsage(threadId)),
  ]);

  if (itemsResult.status === "fulfilled" && itemsResult.value.length > 0) {
    // DB rows are already written in compacted form; rerunning the shared
    // compactor keeps synthetic summary items normalized during hydration.
    const { items } = compactRuntimeItemsForPersistence(
      itemsResult.value.map((row) => ({
        id: row.id,
        type: row.type as RuntimeChatItem["type"],
        state: row.state,
        payload: row.payload,
        streams: row.streams as RuntimeChatItem["streams"],
        ...(row.parentItemId ? { parentItemId: row.parentItemId } : {}),
      })),
    );
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, items);
    // Any sub-agent tool_call that was mid-flight when the prior session
    // ended will hydrate here as still "running" and show up in the active
    // sub-agent dock forever. Reconcile in place so those rows render as
    // terminated immediately instead of waiting for a live event that will
    // never come.
    useAppStore.getState().reconcileStaleSubAgents(threadId);
  } else if (itemsResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate runtime items for thread %s",
      threadId,
      itemsResult.reason,
    );
    captureRendererException(itemsResult.reason, { featureArea: "runtime-persistence" });
  }

  if (turnsResult.status === "fulfilled" && turnsResult.value.length > 0) {
    const records: CompletedTurnRecord[] = turnsResult.value.flatMap((row) => {
      const startedAt = new Date(row.startedAt).getTime();
      const endedAt = new Date(row.endedAt).getTime();
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return [];
      return [{ startedAt, endedAt, anchorItemId: row.anchorItemId }];
    });
    useAppStore.getState().hydrateThreadCompletedTurns(threadId, records);
  } else if (turnsResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate completed turns for thread %s",
      threadId,
      turnsResult.reason,
    );
    captureRendererException(turnsResult.reason, { featureArea: "runtime-persistence" });
  }

  if (contextResult.status === "fulfilled" && contextResult.value) {
    useAppStore.getState().hydrateThreadContextUsage(threadId, contextResult.value);
  } else if (contextResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate context usage for thread %s",
      threadId,
      contextResult.reason,
    );
    captureRendererException(contextResult.reason, { featureArea: "runtime-persistence" });
  }

  return (
    itemsResult.status !== "rejected" &&
    turnsResult.status !== "rejected" &&
    contextResult.status !== "rejected"
  );
}

function remapCompletedTurnAnchors(
  turns: ReadonlyArray<CompletedTurnRecord>,
  anchorRemap: ReadonlyMap<string, string | null>,
): CompletedTurnRecord[] {
  return turns.map((turn) => ({
    ...turn,
    anchorItemId: turn.anchorItemId === null ? null : (anchorRemap.get(turn.anchorItemId) ?? null),
  }));
}

function compactRuntimeItemsForPersistence(
  items: readonly RuntimeChatItem[],
): CompactedRuntimeItems {
  const compacted: RuntimeChatItem[] = [];
  const anchorRemap = new Map<string, string | null>();
  let lastPersistedItemId: string | null = null;
  let idx = 0;
  while (idx < items.length) {
    const item = items[idx]!;
    // Error items are session-transient: they describe a failure of the run
    // that produced them, so persisting them would resurface stale errors in
    // the composer dock every time the thread is reopened. Dropping them here
    // covers both the save path and hydration (which re-runs this compactor),
    // so errors already sitting in older databases are cleaned up on load too.
    if (item.type === "error" || isEmptyCompletedReasoning(item)) {
      // If a turn marker was anchored to a row we drop on save, keep it
      // attached to the previous surviving row so it renders in the same gap.
      anchorRemap.set(item.id, lastPersistedItemId);
      idx += 1;
      continue;
    }
    if (!isToolGroupItem(item) || item.state !== "completed") {
      compacted.push(item);
      anchorRemap.set(item.id, item.id);
      lastPersistedItemId = item.id;
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
    for (const runItem of run) {
      anchorRemap.set(runItem.id, persistedItem.id);
    }
    lastPersistedItemId = persistedItem.id;
  }
  return { items: compacted, anchorRemap };
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
  return {
    id: `tool-call-summary:${first.id}:${last.id}:${items.length}`,
    type: "tool_call",
    state: "completed",
    payload: {
      name: summarizeToolCallNames(items),
      status: "success",
    } satisfies ToolCallPayload,
    streams: {},
  };
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
  if (item.type === "tool_call" && isSubAgentTool(item.payload as ToolCallPayload | undefined)) {
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
  if (isSubAgentTool(payload as ToolCallPayload)) return "executed";

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
