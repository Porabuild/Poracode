import { randomUUID } from "node:crypto";
import type { RuntimeEvent, ThreadContextUsage } from "@/shared/contracts";
import {
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbReplaceThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
  type PersistedRuntimeItem,
} from "../../db";
import type { RemoteBroadcastEvent } from "./context";

const FLUSH_DEBOUNCE_MS = 300;

interface RuntimeCacheEntry {
  items: PersistedRuntimeItem[];
  contextUsage: ThreadContextUsage | null;
  dirtyItems: boolean;
  dirtyContext: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Mirrors canonical runtime events into SQLite from the main-process remote
 * stream. The renderer still has its own debounced persister, but remote/headless
 * sessions cannot depend on a mounted renderer to make `/history` durable.
 */
export class RemoteRuntimePersistence {
  private readonly entries = new Map<string, RuntimeCacheEntry>();

  handleEvent(event: RemoteBroadcastEvent): void {
    switch (event.type) {
      case "thread-runtime-event":
        this.applyEvents(event.threadId, [event.event]);
        return;
      case "thread-runtime-events":
        this.applyEvents(event.threadId, event.events);
        return;
      case "thread-runtime-events-multi":
        for (const batch of event.batches) {
          this.applyEvents(batch.threadId, batch.events);
        }
        return;
      case "thread-reset":
        this.resetThread(event.threadId);
        return;
      case "thread-state":
      case "thread-exited":
        this.flushThread(event.threadId);
        return;
      default:
        return;
    }
  }

  dispose(): void {
    for (const threadId of this.entries.keys()) {
      this.flushThread(threadId);
    }
    this.entries.clear();
  }

  private applyEvents(threadId: string, events: readonly RuntimeEvent[]): void {
    if (events.length === 0) return;
    const entry = this.entryFor(threadId);
    let changed = false;

    for (const event of events) {
      if (this.applyEvent(entry, event)) {
        changed = true;
      }
    }

    if (changed) this.scheduleFlush(threadId, entry);
  }

  private entryFor(threadId: string): RuntimeCacheEntry {
    const existing = this.entries.get(threadId);
    if (existing) return existing;
    const entry: RuntimeCacheEntry = {
      items: dbGetThreadRuntimeItems(threadId),
      contextUsage: dbGetThreadContextUsage(threadId),
      dirtyItems: false,
      dirtyContext: false,
      timer: null,
    };
    this.entries.set(threadId, entry);
    return entry;
  }

  private applyEvent(entry: RuntimeCacheEntry, event: RuntimeEvent): boolean {
    switch (event.type) {
      case "item.started": {
        if (entry.items.some((item) => item.id === event.itemId)) return false;
        entry.items.push({
          id: event.itemId,
          type: event.itemType,
          state: "started",
          streams: {},
          ...(event.payload !== undefined ? { payload: event.payload } : {}),
          ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
        });
        entry.dirtyItems = true;
        return true;
      }

      case "item.updated": {
        const prev = findItem(entry.items, event.itemId);
        if (!prev) return false;
        prev.state = prev.state === "completed" ? "completed" : "updated";
        prev.payload = mergePayload(prev.payload, event.payload);
        entry.dirtyItems = true;
        return true;
      }

      case "item.completed": {
        const index = entry.items.findIndex((item) => item.id === event.itemId);
        if (index < 0) return false;
        const prev = entry.items[index]!;
        const next: PersistedRuntimeItem = {
          ...prev,
          state: "completed",
          ...(event.payload !== undefined
            ? { payload: mergePayload(prev.payload, event.payload) }
            : {}),
        };
        if (next.type === "reasoning" && !(next.streams.reasoning_text ?? "").trim()) {
          entry.items.splice(index, 1);
        } else {
          entry.items[index] = next;
        }
        entry.dirtyItems = true;
        return true;
      }

      case "content.delta": {
        const prev = findItem(entry.items, event.itemId);
        if (!prev) return false;
        prev.state = prev.state === "completed" ? "completed" : "updated";
        prev.streams = {
          ...prev.streams,
          [event.stream]: `${prev.streams[event.stream] ?? ""}${event.delta}`,
        };
        entry.dirtyItems = true;
        return true;
      }

      case "context.updated":
        entry.contextUsage = mergeContextUsage(entry.contextUsage, event.usage);
        entry.dirtyContext = true;
        return true;

      case "error":
        entry.items.push({
          id: `err-${randomUUID()}`,
          type: "error",
          state: "completed",
          payload: { message: event.message },
          streams: {},
        });
        entry.dirtyItems = true;
        return true;

      default:
        return false;
    }
  }

  private scheduleFlush(threadId: string, entry: RuntimeCacheEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.flushThread(threadId), FLUSH_DEBOUNCE_MS);
  }

  private flushThread(threadId: string): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (!entry.dirtyItems && !entry.dirtyContext) return;

    if (entry.dirtyContext) {
      dbReplaceThreadRuntimeSnapshot(
        threadId,
        entry.items,
        dbGetThreadCompletedTurns(threadId),
        entry.contextUsage,
      );
    } else {
      dbReplaceThreadRuntimeItems(threadId, entry.items);
    }
    entry.dirtyItems = false;
    entry.dirtyContext = false;
  }

  private resetThread(threadId: string): void {
    const entry = this.entries.get(threadId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.entries.delete(threadId);
    dbReplaceThreadRuntimeSnapshot(threadId, [], [], null);
  }
}

function findItem(items: PersistedRuntimeItem[], itemId: string): PersistedRuntimeItem | undefined {
  return items.find((item) => item.id === itemId);
}

function mergePayload(prev: unknown, next: unknown): unknown {
  if (!prev || typeof prev !== "object") return next;
  if (!next || typeof next !== "object") return next;
  return { ...(prev as Record<string, unknown>), ...(next as Record<string, unknown>) };
}

function mergeContextUsage(
  prev: ThreadContextUsage | null,
  usage: ThreadContextUsage,
): ThreadContextUsage {
  return {
    ...(prev ?? {}),
    ...usage,
    ...(usage.breakdown ? { breakdown: usage.breakdown } : {}),
  };
}
