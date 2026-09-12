import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";

export type RendererEventInterestKind = "terminal" | "runtime";

export interface RendererEventInterestLease {
  /** Resolves once main/backend acknowledged this interest snapshot. */
  readonly ready: Promise<void>;
  /** True when this stream remained subscribed through a view hand-off. */
  readonly continuous: boolean;
  release(): void;
}

const RELEASE_GRACE_MS = 250;
const counts: Record<RendererEventInterestKind, Map<string, number>> = {
  terminal: new Map(),
  runtime: new Map(),
};
const pendingReleases: Record<
  RendererEventInterestKind,
  Map<string, ReturnType<typeof setTimeout>>
> = {
  terminal: new Map(),
  runtime: new Map(),
};
interface PublishWaiter {
  revision: number;
  resolve(): void;
}

let desiredRevision = 0;
let publishScheduled = false;
let publishInFlight = false;
let latestPublish = Promise.resolve();
const publishWaiters: PublishWaiter[] = [];

function currentThreadIds(kind: RendererEventInterestKind): string[] {
  return [...counts[kind].keys()].sort();
}

function publishInterests(deferToNextTask = false): Promise<void> {
  if (readBridge().appVersion === "remote") return latestPublish;
  const revision = ++desiredRevision;
  latestPublish = new Promise<void>((resolve) => {
    publishWaiters.push({ revision, resolve });
  });
  schedulePublish(deferToNextTask);
  return latestPublish;
}

function schedulePublish(deferToNextTask = false): void {
  if (publishScheduled || publishInFlight) return;
  publishScheduled = true;
  const flush = () => void flushPublish();
  if (deferToNextTask) setTimeout(flush, 0);
  else queueMicrotask(flush);
}

async function flushPublish(): Promise<void> {
  publishScheduled = false;
  if (publishInFlight) return;
  publishInFlight = true;
  const revision = desiredRevision;
  const snapshot = {
    terminalThreadIds: currentThreadIds("terminal"),
    runtimeThreadIds: currentThreadIds("runtime"),
  };
  try {
    await readBridge().setRendererEventInterests(snapshot);
  } catch (error) {
    console.error("[renderer] failed to update live-event interests:", error);
    captureRendererException(error, { featureArea: "live-event-routing" });
  }
  publishInFlight = false;
  for (let index = publishWaiters.length - 1; index >= 0; index -= 1) {
    const waiter = publishWaiters[index];
    if (!waiter || waiter.revision > revision) continue;
    publishWaiters.splice(index, 1);
    waiter.resolve();
  }
  if (desiredRevision > revision) schedulePublish();
}

/**
 * Retains one local high-volume event stream. Ref-counting covers overlapping
 * views/listeners, while the short release grace avoids unsubscribe/resubscribe
 * gaps during React remounts and pane hand-offs.
 */
export function retainRendererEventInterest(
  kind: RendererEventInterestKind,
  threadId: string,
): RendererEventInterestLease {
  const entries = counts[kind];
  const releaseTimers = pendingReleases[kind];
  const pendingRelease = releaseTimers.get(threadId);
  const continuous = pendingRelease !== undefined || (entries.get(threadId) ?? 0) > 0;
  if (pendingRelease !== undefined) {
    clearTimeout(pendingRelease);
    releaseTimers.delete(threadId);
    entries.set(threadId, 1);
  } else {
    const previous = entries.get(threadId) ?? 0;
    entries.set(threadId, previous + 1);
    if (previous === 0) void publishInterests();
  }

  let released = false;
  return {
    ready: latestPublish,
    continuous,
    release: () => {
      if (released) return;
      released = true;
      const current = entries.get(threadId);
      if (current === undefined) return;
      if (current > 1) {
        entries.set(threadId, current - 1);
        return;
      }
      entries.set(threadId, 0);
      const timer = setTimeout(() => {
        releaseTimers.delete(threadId);
        if (entries.get(threadId) !== 0) return;
        entries.delete(threadId);
        void publishInterests(true);
      }, RELEASE_GRACE_MS);
      releaseTimers.set(threadId, timer);
    },
  };
}
