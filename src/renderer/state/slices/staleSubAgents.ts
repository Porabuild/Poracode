import { msg } from "@lingui/core/macro";
import type { RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { i18n } from "@/renderer/i18n/i18n";
import type { RuntimeChatItem } from "./runtimeEventSlice";

const STALE_SUB_AGENT_ERROR_MESSAGE = msg`Interrupted: agent session ended before completion.`;

/**
 * Crossagent runs are owned by the supervisor process, not by the parent
 * session: a parent error, an idle session, and renderer item eviction do not
 * stop them. A parent interrupt cancels at least the foreground runs (a thread
 * interrupt or close cancels every run for the thread via `cancelAllForThread`),
 * any thread restart tears the runs down with it, and the supervisor process
 * exiting kills the rest. A run tile that streamed live in this renderer
 * session therefore may still be tracked by the same supervisor session, so
 * reconciliation must never paint it as failed — the authoritative settle tile
 * (completed/failed/cancelled) eventually arrives and ends the row.
 *
 * Remembering ids for the renderer session lifetime is what makes the check
 * precise: an app restart clears the set, and tiles hydrated from the DB then
 * belong to runs that died with the previous supervisor, so they are still
 * terminated as orphaned. Backend supervisor resets and remote host teardowns
 * clear their entries explicitly (see `pruneLiveObservedCrossagentItems`).
 */
const liveObservedCrossagentItems = new Set<string>();

function liveObservedKey(threadId: string, itemId: string): string {
  return `${threadId}\u0000${itemId}`;
}

/**
 * Record Crossagent run tiles from live runtime events so stale reconciliation
 * keeps them running. Called on the live-event ingestion path only — DB
 * hydration and snapshot replays must not mark items (their runs may belong
 * to a dead supervisor session).
 *
 * A live `item.started` proves the tile began under the currently attached
 * supervisor; a live `item.updated` proves the supervisor still tracks the run
 * (mid-run attaches never see the start again — the first frame they observe
 * is a progress update). Marking a settled row is inert: reconciliation only
 * ever touches rows that still read as running.
 */
export function markLiveCrossagentItems(threadId: string, events: readonly RuntimeEvent[]): void {
  for (const event of events) {
    if (event.type !== "item.started" && event.type !== "item.updated") continue;
    if (event.type === "item.started" && event.itemType !== "tool_call") continue;
    const payload = event.payload as ToolCallPayload | undefined;
    if (payload?.isCrossagent === true) {
      liveObservedCrossagentItems.add(liveObservedKey(threadId, event.itemId));
    }
  }
}

function isLiveObservedCrossagentItem(threadId: string, itemId: string): boolean {
  return liveObservedCrossagentItems.has(liveObservedKey(threadId, itemId));
}

/** Drop all live-observation records (app-session reset, tests). */
export function clearLiveObservedCrossagentItems(): void {
  liveObservedCrossagentItems.clear();
}

/**
 * Drop live-observation records for the threads `matches` selects. Used when
 * the owning host sessions die — remote host teardown/restart prunes that
 * host's thread prefix (`remote:<id>:thread:`), a local backend supervisor
 * reset prunes everything except remote threads (their hosts did not reset).
 * Surviving entries would preserve their tiles as "running" forever.
 */
export function pruneLiveObservedCrossagentItems(matches: (threadId: string) => boolean): void {
  for (const key of liveObservedCrossagentItems) {
    const threadId = key.slice(0, key.indexOf("\u0000"));
    if (matches(threadId)) liveObservedCrossagentItems.delete(key);
  }
}

/**
 * A delegated-agent row (native sub-agent or Crossagents run) that still reads
 * as running. Once the session that owned it is gone — exited, or replaced by
 * another provider in place — nothing will ever complete it.
 */
export function isStaleSubAgentItem(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (!isDelegatedAgentTool(payload)) return false;
  return item.state !== "completed" || payload?.status === "running";
}

export function terminateSubAgentItem(item: RuntimeChatItem): RuntimeChatItem {
  const payload: ToolCallPayload = (item.payload as ToolCallPayload | undefined) ?? {
    name: "Task",
    status: "error",
  };
  const nextPayload: ToolCallPayload = {
    ...payload,
    status: "error",
    ...(payload.isCrossagent &&
    (payload.crossagentStatus === undefined || payload.crossagentStatus === "running")
      ? { crossagentStatus: "failed" as const }
      : {}),
    ...(payload.result === undefined
      ? { result: { error: i18n._(STALE_SUB_AGENT_ERROR_MESSAGE) } }
      : {}),
  };
  return {
    ...item,
    state: "completed",
    payload: nextPayload,
  };
}

/**
 * Terminate every stale delegated-agent row in a thread's item map. Returns the
 * replacement map, or undefined when nothing needed terminating so callers can
 * skip the state write. `preserveObservedLive` keeps rows this renderer saw
 * stream live, for reconciles that run while the session may still be up.
 *
 * Live-observed Crossagent rows are kept unless `force` is set: the supervisor
 * session that started them is still alive in this app session (parent errors,
 * idle states, and item eviction do not stop Crossagent runs), so their
 * authoritative settle tile will arrive. `force` is for paths where the
 * supervisor has already cancelled the runs — provider switch tears the thread
 * down through `closeThread`, which runs `cancelAllForThread`. Rows hydrated
 * from the DB were never observed live; their runs died with the previous
 * supervisor session and they always terminate.
 */
export function terminateStaleSubAgentItems(
  threadId: string,
  items: Readonly<Record<string, RuntimeChatItem>>,
  options?: { preserveObservedLive?: boolean; force?: boolean },
): Record<string, RuntimeChatItem> | undefined {
  let nextItems: Record<string, RuntimeChatItem> | undefined;
  for (const [id, item] of Object.entries(items)) {
    if (options?.preserveObservedLive === true && item.observedLive === true) continue;
    if (!isStaleSubAgentItem(item)) continue;
    const payload = item.payload as ToolCallPayload | undefined;
    if (
      options?.force !== true &&
      payload?.isCrossagent === true &&
      isLiveObservedCrossagentItem(threadId, id)
    )
      continue;
    nextItems ??= { ...items };
    nextItems[id] = terminateSubAgentItem(item);
  }
  return nextItems;
}
