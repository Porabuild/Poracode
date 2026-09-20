import { dbGetThreads, dbSetThreadsDone } from "@/host/db";
import { isThreadTurnActive, type PrWatch } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { reportSettingsError } from "@/backend/BackendSettingsNotifications";

/**
 * Durable PR-merge settle for headless hosts. The desktop renderer performs
 * `autoMarkDoneOnPrMerge` from the native `pr-watch-merged` event; with no
 * mounted renderer the host performs the durable part itself: matching,
 * not-yet-done, non-active threads flip to done and remote clients learn about
 * it through the standard `remote-threads-changed` broadcast. Threads mid-turn
 * are skipped — the desktop renderer defers them until the turn settles, and a
 * host-side retry does not exist yet.
 */
export function createHeadlessPrMergeEffect(options: {
  getSharedSettings(): SharedSettings;
  publishThreadsChanged(threadIds: string[]): void;
  reportError?(error: unknown): void;
}): (watch: PrWatch) => void {
  return (watch) => {
    try {
      if (!options.getSharedSettings().autoMarkDoneOnPrMerge) return;
      const merged = dbGetThreads().filter(
        (thread) =>
          !thread.done &&
          !isThreadTurnActive(thread.status) &&
          ((watch.worktreePath !== undefined && thread.worktreePath === watch.worktreePath) ||
            (watch.worktreePath === undefined &&
              thread.projectId === watch.projectId &&
              thread.prNumber === watch.prNumber)),
      );
      if (merged.length === 0) return;
      const doneAt = new Date().toISOString();
      dbSetThreadsDone(
        merged.map((thread) => thread.id),
        doneAt,
      );
      options.publishThreadsChanged(merged.map((thread) => thread.id));
    } catch (error) {
      reportSettingsError(error, options.reportError);
    }
  };
}
