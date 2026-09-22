export type RendererEventInterestKind = "terminal" | "runtime";

/**
 * The renderer's retained live-event interests: the single source of truth for
 * "which threads does this window currently need live content for".
 *
 * The managed loopback intake consumes {@link snapshotRendererEventInterests}
 * for the socket's `threadItemInterests` (wire) and subscribes to changes with
 * {@link subscribeRendererEventInterests}. The legacy `setRendererEventInterests`
 * IPC publish was removed with the backend relay (A2): the loopback WS is the
 * only live-content consumer, and main no longer routes renderer content.
 */
export interface RendererEventInterestSnapshot {
  /** Terminal watches, sorted. Terminal delivery is `terminal-watch`-scoped,
   * never item interests — consumers must not fold these into the wire array. */
  readonly terminalThreadIds: readonly string[];
  /**
   * Runtime thread ids ordered most-recently-retained-first. When a bounded
   * wire consumer must drop ids, the newest (focused/opened) panes win and a
   * dropped-but-still-retained pane recovers on its next visibility change.
   */
  readonly runtimeThreadIds: readonly string[];
}

export interface RendererEventInterestLease {
  /** Resolves once every local subscriber (the managed socket intake) applied
   * the snapshot that carries this interest. A retain that cannot change the
   * published snapshot resolves against the already-applied one, so `ready`
   * never resolves ahead of wire membership. */
  readonly ready: Promise<void>;
  /**
   * True when this stream stayed subscribed through a view hand-off AND the
   * managed wire currently carries it. The wire consumer reports its bounded
   * applied set through {@link noteRendererEventInterestWireCoverage}; a
   * retained runtime thread the wire cap dropped is NOT continuously covered,
   * so consumers that would otherwise trust a local accumulator must take an
   * authoritative baseline instead.
   */
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
const subscribers = new Set<(snapshot: RendererEventInterestSnapshot) => void>();

/**
 * The runtime ids the managed socket currently carries, as reported by the
 * wire consumer. `null` means coverage was never established or the leg is
 * down/being torn down — a retained runtime thread is then not covered.
 */
let wireCoveredRuntimeIds: ReadonlySet<string> | null = null;

interface PublishWaiter {
  revision: number;
  resolve(): void;
}

let desiredRevision = 0;
let publishScheduled = false;
let publishInFlight = false;
let latestPublish = Promise.resolve();
const publishWaiters: PublishWaiter[] = [];
/** The last snapshot handed to subscribers. A publish that cannot change it
 * (for example a re-retain that is already the most recent id) must not
 * notify — that would turn coalescing and React remounts into rebuild churn. */
let lastNotifiedSnapshot: RendererEventInterestSnapshot | null = null;

function currentThreadIds(kind: RendererEventInterestKind): string[] {
  return [...counts[kind].keys()].sort();
}

function lastRetainedId(kind: RendererEventInterestKind): string | undefined {
  let last: string | undefined;
  for (const threadId of counts[kind].keys()) last = threadId;
  return last;
}

function sameThreadIdList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((threadId, index) => threadId === right[index]);
}

function sameSnapshot(
  left: RendererEventInterestSnapshot,
  right: RendererEventInterestSnapshot,
): boolean {
  return (
    sameThreadIdList(left.terminalThreadIds, right.terminalThreadIds) &&
    sameThreadIdList(left.runtimeThreadIds, right.runtimeThreadIds)
  );
}

/**
 * Diagnostics are loaded lazily: this module is imported by the host-transport
 * barrel (`preloadIpcTransport` rebuild reads its snapshot), so a static
 * `sentry` import would close the `bridge → clientRuntime → hostTransport →
 * preloadIpcTransport → here` cycle at module-evaluation time (A1/A2 cycle
 * note). Failure reporting is best-effort and must never rethrow.
 */
function reportSubscriberFailure(error: unknown): void {
  console.error("[renderer] live-event interest subscriber failed:", error);
  void import("@/renderer/diagnostics/sentry")
    .then(({ captureRendererException }) => {
      captureRendererException(error, { featureArea: "live-event-routing" });
    })
    .catch(() => undefined);
}

/** Insertion order is recency order: a thread that becomes retained (or is
 * re-retained during the release grace) moves to the end. */
function markRetained(kind: RendererEventInterestKind, threadId: string, count: number): void {
  const entries = counts[kind];
  entries.delete(threadId);
  entries.set(threadId, count);
}

function buildSubscriberSnapshot(): RendererEventInterestSnapshot {
  return {
    terminalThreadIds: currentThreadIds("terminal"),
    runtimeThreadIds: [...counts.runtime.keys()].reverse(),
  };
}

function publishInterests(deferToNextTask = false): Promise<void> {
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
  // Apply to local subscribers (the managed loopback socket) synchronously, so
  // an interest lease's `ready` implies the socket already carries this
  // snapshot — never the other way around. There is no IPC publish after A2.
  const subscriberSnapshot = buildSubscriberSnapshot();
  if (lastNotifiedSnapshot === null || !sameSnapshot(subscriberSnapshot, lastNotifiedSnapshot)) {
    lastNotifiedSnapshot = subscriberSnapshot;
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(subscriberSnapshot);
      } catch (error) {
        reportSubscriberFailure(error);
      }
    }
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
 * The current retained interests, readable without publishing. `runtimeThreadIds`
 * is priority-ordered (most recently retained first); the wire consumer applies
 * its own bounded selection. Terminal ids are for terminal-watch consumers only.
 */
export function snapshotRendererEventInterests(): RendererEventInterestSnapshot {
  return buildSubscriberSnapshot();
}

/**
 * Notified synchronously whenever the retained set actually changes (coalesced
 * per publish; a publish that cannot change the published snapshot does not
 * notify). Returns the unsubscribe.
 */
export function subscribeRendererEventInterests(
  listener: (snapshot: RendererEventInterestSnapshot) => void,
): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

/**
 * The wire consumer (managed loopback intake) reports the bounded runtime ids
 * the socket currently carries. `null` means the leg carries nothing (down,
 * disposed, or never opened). This is the only input to the runtime half of
 * {@link RendererEventInterestLease.continuous}; the registry itself stays
 * unaware of the wire's capacity.
 */
export function noteRendererEventInterestWireCoverage(threadIds: readonly string[] | null): void {
  wireCoveredRuntimeIds = threadIds === null ? null : new Set(threadIds);
}

function isContinuouslyCovered(kind: RendererEventInterestKind, threadId: string): boolean {
  if (kind === "terminal") {
    // Terminal delivery is `terminal-watch`-scoped on the same socket and is
    // not subject to the item-interest cap; the terminal feed owns its own
    // gap/resync semantics.
    return true;
  }
  return wireCoveredRuntimeIds?.has(threadId) === true;
}

/**
 * Retains one local high-volume event stream. Ref-counting covers overlapping
 * views/listeners, while the short release grace avoids unsubscribe/resubscribe
 * gaps during React remounts and pane hand-offs.
 *
 * Recency is wire priority: every retain moves the id to the most-recent end,
 * so a retain that moves an id can change which ids a bounded wire consumer
 * keeps (for example re-admitting a previously cap-dropped thread). Such
 * retains publish even when the id was already retained, and their `ready`
 * resolves only after the new snapshot reached subscribers — otherwise `ready`
 * would claim membership the wire never received. A retain that leaves the
 * published snapshot unchanged (already the most recent id) does not publish
 * and resolves `ready` against the already-applied snapshot.
 */
export function retainRendererEventInterest(
  kind: RendererEventInterestKind,
  threadId: string,
): RendererEventInterestLease {
  const entries = counts[kind];
  const releaseTimers = pendingReleases[kind];
  const pendingRelease = releaseTimers.get(threadId);
  const handOffContinuous = pendingRelease !== undefined || (entries.get(threadId) ?? 0) > 0;
  const alreadyMostRecent = lastRetainedId(kind) === threadId;
  if (pendingRelease !== undefined) {
    clearTimeout(pendingRelease);
    releaseTimers.delete(threadId);
    markRetained(kind, threadId, 1);
    if (!alreadyMostRecent) void publishInterests();
  } else {
    const previous = entries.get(threadId) ?? 0;
    markRetained(kind, threadId, previous + 1);
    if (previous === 0 || !alreadyMostRecent) void publishInterests();
  }

  // Captured after the publish above: when this retain changed the snapshot,
  // `ready` is the promise of exactly that publish.
  const ready = latestPublish;
  let released = false;
  const lease: RendererEventInterestLease = {
    ready,
    get continuous() {
      return handOffContinuous && isContinuouslyCovered(kind, threadId);
    },
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
  return lease;
}

/** Test seam: clear retained state, coverage and subscribers between cases. */
export function __resetRendererEventInterestsForTest(): void {
  for (const kind of ["terminal", "runtime"] as const) {
    for (const timer of pendingReleases[kind].values()) clearTimeout(timer);
    pendingReleases[kind].clear();
    counts[kind].clear();
  }
  subscribers.clear();
  wireCoveredRuntimeIds = null;
  lastNotifiedSnapshot = null;
  publishWaiters.splice(0);
  desiredRevision = 0;
  publishScheduled = false;
  publishInFlight = false;
  latestPublish = Promise.resolve();
}
