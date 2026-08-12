import { ActivityBridge } from "@poracode/activity-bridge";
import type { RemoteLiveActivityContentState } from "@/shared/remote";

/**
 * Foreground Live Activity driving for the native iOS app.
 *
 * While the app is foregrounded and connected, it already receives every
 * `thread-state` transition over the remote WebSocket (see `storeSync`). This
 * controller mirrors the desktop `PushCoordinator`'s active-thread model
 * locally so a Live Activity appears on the lock screen the instant a run
 * starts — without waiting for an APNs round-trip.
 *
 * Plugin-API limitation: `@poracode/activity-bridge` exposes only
 * `startActivity` / `endActivity` — there is NO local `updateActivity` method
 * (see `native/activity-bridge/src/definitions.ts`). Adding one is out of scope
 * (it lives under `native/`). So local driving is deliberately minimal: we
 * START the activity on the first active thread and END it when the last active
 * thread finishes. Every intermediate content-state change (a second thread
 * starting, a status flipping to needs_approval, the running count changing) is
 * delivered by the desktop's APNs update pushes, which arrive even while the
 * app is foregrounded. This keeps the on-device state and the pushed state from
 * fighting over the single activity.
 *
 * Inert until {@link configureLiveActivities} is called with a desktop context
 * — the wiring only does that on the native app when ActivityKit reports Live
 * Activities are supported, so the PWA and web builds never start an activity.
 */

/** Thread statuses that count as "running" for the activity. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["working", "needs_approval", "needs_reply"]);

interface DesktopContext {
  readonly desktopId: string;
  readonly desktopName: string;
}

interface TrackedThread {
  /** Epoch ms of the first transition into an active state (drives the timer). */
  startedAt: number;
  /** Epoch ms of the most recent active event (orders the rows). */
  lastActiveAt: number;
  title: string;
  project: string;
  status: string;
}

let context: DesktopContext | null = null;
let activityId: string | null = null;
const tracked = new Map<string, TrackedThread>();

export interface ThreadStateInput {
  readonly threadId: string;
  readonly status: string;
  readonly title: string;
  readonly project: string;
}

/**
 * Point the controller at the paired desktop (or clear it). Switching desktops
 * ends any running activity and drops the tracked threads so the next desktop
 * starts clean. Passing `null` (unpair / disconnect) does the same teardown.
 */
export function configureLiveActivities(next: DesktopContext | null): void {
  const changed = context?.desktopId !== next?.desktopId;
  if (changed && (activityId || tracked.size > 0)) {
    void endCurrentActivity();
    tracked.clear();
  }
  context = next;
}

/** Full teardown on session reset — end the activity and forget everything. */
export function resetLiveActivities(): void {
  void endCurrentActivity();
  tracked.clear();
  context = null;
}

/**
 * Feed a `thread-state` transition into the model and start/end the activity at
 * the running-count boundaries. Returns once any bridge call settles so callers
 * (and tests) can await the effect; `storeSync` fires it as `void`.
 */
export async function notifyLiveActivityThreadState(input: ThreadStateInput): Promise<void> {
  if (!context) return;
  const hadActive = tracked.size > 0;

  if (ACTIVE_STATUSES.has(input.status)) {
    const now = Date.now();
    const existing = tracked.get(input.threadId);
    tracked.set(input.threadId, {
      startedAt: existing?.startedAt ?? now,
      lastActiveAt: now,
      title: input.title,
      project: input.project,
      status: input.status,
    });
  } else if (tracked.has(input.threadId)) {
    tracked.delete(input.threadId);
  } else {
    // A non-active status for an untracked thread changes nothing.
    return;
  }

  const hasActive = tracked.size > 0;
  const contentState = buildContentState();
  if (!hadActive && hasActive) {
    await startActivity(contentState);
  } else if (hadActive && !hasActive) {
    await endCurrentActivity(contentState);
  }
  // Still ≥1 active with a changed state → no local update (see the file
  // header): the desktop's APNs update push carries the new content-state.
}

/** Build the current content-state: running count + top 3 most-recent rows. */
export function buildContentState(): RemoteLiveActivityContentState {
  const threads = [...tracked.entries()]
    .sort((a, b) => b[1].lastActiveAt - a[1].lastActiveAt)
    .slice(0, 3)
    .map(([threadId, entry]) => ({
      threadId,
      title: entry.title,
      project: entry.project,
      status: entry.status,
      startedAt: entry.startedAt,
    }));
  return { runningCount: tracked.size, threads };
}

async function startActivity(contentState: RemoteLiveActivityContentState): Promise<void> {
  if (!context || activityId) return;
  try {
    const result = await ActivityBridge.startActivity({
      attributes: { desktopId: context.desktopId, desktopName: context.desktopName },
      contentState,
    });
    activityId = result.activityId;
  } catch (error) {
    // Quiet: an unsupported OS or a denied activity must not surface to the UI.
    console.warn("[push] failed to start Live Activity", error);
  }
}

async function endCurrentActivity(contentState?: RemoteLiveActivityContentState): Promise<void> {
  const id = activityId;
  if (!id) return;
  activityId = null;
  try {
    await ActivityBridge.endActivity(
      contentState ? { activityId: id, contentState } : { activityId: id },
    );
  } catch (error) {
    console.warn("[push] failed to end Live Activity", error);
  }
}

/** Test-only reset of module state (no bridge calls). */
export function __resetLiveActivityStateForTests(): void {
  context = null;
  activityId = null;
  tracked.clear();
}
