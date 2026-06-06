import { create } from "zustand";
import type { ProjectLocation, WorkflowRun } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

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
 * Lifecycle: when the last subscriber unsubscribes, we cancel the timer but
 * keep the last `run` snapshot in the store. Re-subscribing returns instantly
 * from cache, then resumes polling if status is still running.
 */

const ACTIVE_POLL_MS = 1500;
const ERROR_BACKOFF_MS = 3000;

interface PollerState {
  manifestPath: string;
  transcriptDir: string | undefined;
  includeAgentChats: boolean;
  chatRefCount: number;
  location: ProjectLocation;
  refCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
}

interface WorkflowRunEntry {
  manifestPath: string;
  run: WorkflowRun | null;
  loading: boolean;
  error: string | null;
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

export const useWorkflowRunStore = create<WorkflowRunStore>((set, get) => {
  function setEntry(itemId: string, patch: Partial<WorkflowRunEntry>): void {
    set((state) => {
      const previous = state.byItemId[itemId];
      if (!previous) return state;
      const next: WorkflowRunEntry = { ...previous, ...patch };
      return { byItemId: { ...state.byItemId, [itemId]: next } };
    });
  }

  async function tick(itemId: string): Promise<void> {
    const poller = pollers.get(itemId);
    if (!poller || poller.cancelled) return;
    try {
      const result = await readBridge().workflowGetRun({
        manifestPath: poller.manifestPath,
        location: poller.location,
        ...(poller.transcriptDir ? { transcriptDir: poller.transcriptDir } : {}),
        ...(poller.includeAgentChats ? { includeAgentChats: true } : {}),
      });
      if (poller.cancelled) return;
      // A `null` run means the manifest file doesn't exist yet — the
      // workflow runtime writes it lazily on the first progress event.
      // Keep polling at the active cadence rather than backing off; the
      // file usually shows up within a couple of seconds of launch.
      setEntry(itemId, { run: result.run, loading: false, error: null });
      const isLive = !result.run || isLiveStatus(result.run.status);
      if (isLive) {
        poller.timer = setTimeout(() => void tick(itemId), ACTIVE_POLL_MS);
      } else {
        // Manifest reports terminal status — stop polling but keep snapshot.
        poller.timer = null;
      }
    } catch (err) {
      if (poller.cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      setEntry(itemId, { loading: false, error: message });
      // Back off on errors but keep retrying while we have subscribers.
      poller.timer = setTimeout(() => void tick(itemId), ERROR_BACKOFF_MS);
    }
  }

  return {
    byItemId: {},
    subscribe(itemId, manifestPath, location, transcriptDir, includeAgentChats = false) {
      const existing = pollers.get(itemId);
      if (existing) {
        existing.refCount += 1;
        let shouldFetch = !get().byItemId[itemId]?.run;
        if (includeAgentChats && !existing.includeAgentChats) {
          existing.chatRefCount += 1;
          existing.includeAgentChats = true;
          shouldFetch = true;
        } else if (includeAgentChats) {
          existing.chatRefCount += 1;
        }
        if (!existing.timer && shouldFetch) {
          existing.timer = setTimeout(() => void tick(itemId), 0);
        }
      } else {
        const poller: PollerState = {
          manifestPath,
          transcriptDir,
          includeAgentChats,
          chatRefCount: includeAgentChats ? 1 : 0,
          location,
          refCount: 1,
          timer: null,
          cancelled: false,
        };
        pollers.set(itemId, poller);
        const entry = get().byItemId[itemId];
        if (!entry) {
          set((state) => ({
            byItemId: {
              ...state.byItemId,
              [itemId]: { manifestPath, run: null, loading: true, error: null },
            },
          }));
        }
        poller.timer = setTimeout(() => void tick(itemId), 0);
      }
      return () => {
        const poller = pollers.get(itemId);
        if (!poller) return;
        poller.refCount = Math.max(0, poller.refCount - 1);
        if (includeAgentChats) {
          poller.chatRefCount = Math.max(0, poller.chatRefCount - 1);
          poller.includeAgentChats = poller.chatRefCount > 0;
        }
        if (poller.refCount === 0) {
          poller.cancelled = true;
          if (poller.timer) {
            clearTimeout(poller.timer);
            poller.timer = null;
          }
          pollers.delete(itemId);
        }
      };
    },
  };
});

function isLiveStatus(status: WorkflowRun["status"]): boolean {
  return status === "running" || status === "unknown";
}

export function selectWorkflowRun(
  state: WorkflowRunStore,
  itemId: string,
): WorkflowRunEntry | undefined {
  return state.byItemId[itemId];
}
