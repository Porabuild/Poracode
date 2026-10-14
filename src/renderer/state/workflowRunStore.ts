import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { isWorkflowRunLive, type ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  IdleWorkflowRunCache,
  withoutWorkflowAgentChats,
  type WorkflowRunEntry,
  type WorkflowRunSource,
} from "./workflowRunCache";

/**
 * Shared poller for the workflow manifest. Both the chat-row stats
 * (`SubAgentToolCall`) and the composer's active dock (`ActiveSubAgentTile`)
 * need live counters and a way to detect when the workflow has finished. We
 * keep a single in-flight poll per `itemId`, ref-counted by subscribers, so
 * the live tail doesn't fan out into N parallel HTTP-equivalent IPC calls.
 *
 * Polling cadence:
 *   - 1.5s while the manifest reports running, OR while we haven't fetched yet
 *   - Stops once the manifest reports `completed | failed | cancelled`
 *   - Doubles to 3s after a fetch error so transient failures back off
 *
 * Lifecycle: the last detail subscriber releases reconstructible chats; the
 * last subscriber cancels polling and retains only a bounded warm summary.
 * Re-subscribing refetches details, including for terminal workflows.
 */

const ACTIVE_POLL_MS = 1500;
const ERROR_BACKOFF_MS = 3000;

interface Subscribers {
  refCount: number;
  chatRefCount: number;
}

interface PollerState extends WorkflowRunSource {
  subscribers: Subscribers;
  timer: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
  inFlight: boolean;
  refreshRequested: boolean;
}

interface WorkflowRunStore {
  byItemId: Record<string, WorkflowRunEntry>;
  /** Begin a ref-counted subscription. Caller MUST invoke the returned dispose. */
  subscribe: (
    itemId: string,
    manifestPath: string,
    location: ProjectLocation,
    transcriptDir?: string,
    includeAgentChats?: boolean,
  ) => () => void;
}

const pollers = new Map<string, PollerState>();
const idleCache = new IdleWorkflowRunCache();

function sameSource(left: WorkflowRunSource, right: WorkflowRunSource): boolean {
  return (
    left.manifestPath === right.manifestPath &&
    left.transcriptDir === right.transcriptDir &&
    shallow(left.location, right.location)
  );
}

function cancelPoller(poller: PollerState): void {
  poller.cancelled = true;
  if (poller.timer !== null) clearTimeout(poller.timer);
  poller.timer = null;
}

export const useWorkflowRunStore = create<WorkflowRunStore>((set, get) => {
  function setEntry(itemId: string, patch: Partial<WorkflowRunEntry>): void {
    set((state) => {
      const previous = state.byItemId[itemId];
      if (!previous) return state;
      const next: WorkflowRunEntry = { ...previous, ...patch };
      if (shallow(previous, next)) return state;
      return { byItemId: { ...state.byItemId, [itemId]: next } };
    });
  }

  function isCurrent(itemId: string, poller: PollerState): boolean {
    return !poller.cancelled && pollers.get(itemId) === poller;
  }

  function scheduleTick(itemId: string, poller: PollerState, delay: number): void {
    if (!isCurrent(itemId, poller) || poller.inFlight || poller.timer !== null) return;
    poller.timer = setTimeout(() => {
      poller.timer = null;
      void tick(itemId, poller);
    }, delay);
  }

  function refresh(itemId: string, poller: PollerState): void {
    if (poller.inFlight) {
      poller.refreshRequested = true;
      return;
    }
    if (poller.timer !== null) clearTimeout(poller.timer);
    poller.timer = null;
    scheduleTick(itemId, poller, 0);
  }

  function retainIdleSummary(
    itemId: string,
    { manifestPath, transcriptDir, location }: WorkflowRunSource,
  ): void {
    const source = { manifestPath, transcriptDir, location };
    const previous = get().byItemId[itemId];
    if (!previous) return;
    const run = withoutWorkflowAgentChats(previous.run);
    const next = run === previous.run ? previous : { ...previous, run };
    const evicted = run ? idleCache.retain(itemId, source, next) : [itemId];
    if (next === previous && evicted.length === 0) return;
    set((state) => {
      const byItemId = { ...state.byItemId, [itemId]: next };
      for (const id of evicted) delete byItemId[id];
      return { byItemId };
    });
  }

  async function tick(itemId: string, poller: PollerState): Promise<void> {
    if (!isCurrent(itemId, poller) || poller.inFlight) return;
    poller.inFlight = true;
    poller.refreshRequested = false;
    const includeAgentChats = poller.subscribers.chatRefCount > 0;
    let nextDelay: number | null = null;
    try {
      const result = await readBridge().workflowGetRun({
        manifestPath: poller.manifestPath,
        location: poller.location,
        ...(poller.transcriptDir ? { transcriptDir: poller.transcriptDir } : {}),
        ...(includeAgentChats ? { includeAgentChats: true } : {}),
      });
      if (!isCurrent(itemId, poller)) return;
      // A `null` run means the manifest file doesn't exist yet — the
      // workflow runtime writes it lazily on the first progress event.
      // Keep polling at the active cadence rather than backing off; the
      // file usually shows up within a couple of seconds of launch.
      const run =
        poller.subscribers.chatRefCount > 0 ? result.run : withoutWorkflowAgentChats(result.run);
      setEntry(itemId, { run, loading: false, error: null });
      const isLive = !result.run || isWorkflowRunLive(result.run);
      nextDelay = isLive ? ACTIVE_POLL_MS : null;
    } catch (err) {
      if (!isCurrent(itemId, poller)) return;
      const message = err instanceof Error ? err.message : String(err);
      setEntry(itemId, { loading: false, error: message });
      // Back off on errors but keep retrying while we have subscribers.
      nextDelay = ERROR_BACKOFF_MS;
    } finally {
      poller.inFlight = false;
      if (poller.refreshRequested) nextDelay = 0;
      if (nextDelay !== null) scheduleTick(itemId, poller, nextDelay);
    }
  }

  return {
    byItemId: {},
    subscribe(itemId, manifestPath, location, transcriptDir, includeAgentChats = false) {
      const source: WorkflowRunSource = { manifestPath, location, transcriptDir };
      let existing = pollers.get(itemId);
      // A resolved path/remote owner replaces the fetch generation, retaining
      // the subscriber group so older disposers still release their own refs.
      const subscribers = existing?.subscribers ?? { refCount: 0, chatRefCount: 0 };
      const needsChats = includeAgentChats && subscribers.chatRefCount === 0;
      subscribers.refCount += 1;
      if (includeAgentChats) subscribers.chatRefCount += 1;
      if (existing && !sameSource(existing, source)) {
        cancelPoller(existing);
        existing = undefined;
      }
      if (existing) {
        if (needsChats) refresh(itemId, existing);
      } else {
        const poller: PollerState = {
          ...source,
          subscribers,
          timer: null,
          cancelled: false,
          inFlight: false,
          refreshRequested: false,
        };
        pollers.set(itemId, poller);
        const cachedSource = idleCache.take(itemId);
        const entry = get().byItemId[itemId];
        if (!entry || !cachedSource || !sameSource(cachedSource, source)) {
          set((state) => ({
            byItemId: {
              ...state.byItemId,
              [itemId]: { manifestPath, run: null, loading: true, error: null },
            },
          }));
        }
        scheduleTick(itemId, poller, 0);
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const poller = pollers.get(itemId);
        if (!poller || poller.subscribers !== subscribers) return;
        subscribers.refCount -= 1;
        if (includeAgentChats) subscribers.chatRefCount -= 1;
        if (subscribers.refCount === 0) {
          cancelPoller(poller);
          pollers.delete(itemId);
          retainIdleSummary(itemId, poller);
        } else if (includeAgentChats && subscribers.chatRefCount === 0) {
          setEntry(itemId, { run: withoutWorkflowAgentChats(get().byItemId[itemId]?.run ?? null) });
        }
      };
    },
  };
});

export function selectWorkflowRun(
  state: WorkflowRunStore,
  itemId: string,
): WorkflowRunEntry | undefined {
  return state.byItemId[itemId];
}
