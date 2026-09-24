import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { unloadStoredThread } from "./threadActions";

/**
 * Re-file a thread under a different project. Modelled on
 * `moveThreadToWorktree`: a launching thread is refused (mid-launch, the
 * runtime is still pointing at the old project), a live thread is unloaded
 * first so no runtime survives the move, and the store mutation clears the
 * thread's worktree fields — a worktree belongs to the project it was
 * created under.
 *
 * Unlike a worktree move, there is no host-side command for this: a
 * remote-owned thread is refused outright rather than routed, since changing
 * `projectId` locally would only desync the mirror.
 */
export async function moveThreadToProject(threadId: string, projectId: string): Promise<void> {
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread || thread.projectId === projectId) return;

  const project = store.projects.find((item) => item.id === projectId);
  if (!project) return;

  if (remoteOwner(thread) !== undefined) {
    toast.danger(
      i18n._(msg`This thread is hosted on another desktop; it can't be moved to a local project.`),
    );
    return;
  }

  if (thread.status === "launching") {
    toast.info(
      i18n._(msg`Wait for the thread to finish starting before moving it to another project.`),
    );
    return;
  }

  if (thread.status !== "inactive") {
    await unloadStoredThread(threadId);
    // The runtime does not survive the move (it holds the old project's
    // working directory), and nothing relaunches it in the new one — tell the
    // user, or a busy thread silently goes inactive under them.
    toast.info(i18n._(msg`The thread was stopped to move it — start it again in its new project.`));
  }

  useAppStore.getState().moveThreadToProject(threadId, projectId);
}
