import { dbGetThreads, dbMarkLiveThreadsInactive } from "@/host/db";
import { isThreadTurnActive } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";

/** Commit supervisor-reset state once and describe each publication group.
 * Callers retain custody of their distinct event destinations.
 */
export function inactivateLiveThreads(): {
  queueEvents: SupervisorEvent[];
  inactiveEvents: SupervisorEvent[];
} {
  const threads = dbGetThreads();
  dbMarkLiveThreadsInactive();
  return {
    queueEvents: threads.map((thread) => ({
      type: "thread-follow-up-queue",
      threadId: thread.id,
      queue: null,
    })),
    inactiveEvents: threads
      .filter((thread) => isThreadTurnActive(thread.status))
      .map((thread) => ({
        type: "thread-state",
        threadId: thread.id,
        status: "inactive",
        attention: "none",
        canResumeWithConfig: thread.canResumeWithConfig,
      })),
  };
}
