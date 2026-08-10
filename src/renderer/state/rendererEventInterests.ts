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
let publishTail = Promise.resolve();
let latestPublish = publishTail;

function currentThreadIds(kind: RendererEventInterestKind): string[] {
  return [...counts[kind].keys()].sort();
}

function publishInterests(): Promise<void> {
  if (readBridge().appVersion === "remote") return latestPublish;
  const snapshot = {
    terminalThreadIds: currentThreadIds("terminal"),
    runtimeThreadIds: currentThreadIds("runtime"),
  };
  latestPublish = publishTail
    .then(() => readBridge().setRendererEventInterests(snapshot))
    .catch((error: unknown) => {
      console.error("[renderer] failed to update live-event interests:", error);
      captureRendererException(error, { featureArea: "live-event-routing" });
    });
  publishTail = latestPublish;
  return latestPublish;
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
        void publishInterests();
      }, RELEASE_GRACE_MS);
      releaseTimers.set(threadId, timer);
    },
  };
}
