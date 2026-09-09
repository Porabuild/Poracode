import type { LiveEventInterests } from "@/shared/liveEventInterests";

/** Minimal structural view of an Electron `WebContents` the registry needs. */
export interface RendererEventSender {
  readonly id: number;
  once(channel: "destroyed", listener: () => void): unknown;
}

export const EMPTY_RENDERER_EVENT_INTERESTS: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
  allRuntimeEvents: false,
};

function mergeInterests(entries: Iterable<LiveEventInterests>): LiveEventInterests {
  const terminal = new Set<string>();
  const runtime = new Set<string>();
  let allRuntimeEvents = false;
  for (const entry of entries) {
    for (const threadId of entry.terminalThreadIds) terminal.add(threadId);
    for (const threadId of entry.runtimeThreadIds) runtime.add(threadId);
    allRuntimeEvents ||= entry.allRuntimeEvents;
  }
  return {
    terminalThreadIds: [...terminal].sort(),
    runtimeThreadIds: [...runtime].sort(),
    allRuntimeEvents,
  };
}

/**
 * Per-window renderer event interests.
 *
 * Every renderer window publishes its own snapshot through the
 * `setRendererEventInterests` procedure. The backend host's live-event router
 * routes the union of all registered windows (plus remote interests), so one
 * window's snapshot can never silently starve another window's desktop-IPC
 * fallback. Entries release when their webContents is destroyed, and can be
 * dropped eagerly when a window navigates or its renderer dies.
 */
export class RendererEventInterestRegistry {
  private readonly entries = new Map<number, LiveEventInterests>();
  private readonly observedSenders = new WeakSet<RendererEventSender>();
  private merged = EMPTY_RENDERER_EVENT_INTERESTS;

  constructor(private readonly onInterestsChanged: (merged: LiveEventInterests) => void) {}

  set(sender: RendererEventSender | null, interests: LiveEventInterests): void {
    const id = sender?.id ?? 0;
    if (sender && !this.observedSenders.has(sender)) {
      this.observedSenders.add(sender);
      sender.once("destroyed", () => this.release(id));
    }
    this.entries.set(id, interests);
    this.emitMerged();
  }

  release(senderId: number): void {
    if (!this.entries.delete(senderId)) return;
    this.emitMerged();
  }

  releaseAll(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.emitMerged();
  }

  /** The current union of every registered window's interests. */
  snapshot(): LiveEventInterests {
    return this.merged;
  }

  private emitMerged(): void {
    const merged = mergeInterests(this.entries.values());
    if (JSON.stringify(merged) === JSON.stringify(this.merged)) return;
    this.merged = merged;
    this.onInterestsChanged(merged);
  }
}
