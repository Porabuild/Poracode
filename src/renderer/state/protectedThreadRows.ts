import { useAppStore } from "./appStore";
import { auxiliaryThreadIds } from "./auxiliaryThreadWindows";
import { pinnedThreadRowIds, retainedUncertainLaunchThreadIds } from "./threadLaunchIntents";

/**
 * Thread rows (store ids) a host catalog's deletion gate must never remove,
 * whichever host owns them: call-scoped pins, rows shown in a pane or a side
 * window, in-flight worktree provisioning, queued launch episodes, and
 * retained UNCERTAIN launch operations (whose same-command-id replay must
 * survive until the host resolves it or the row is removed — an absent
 * durable row is evidence only).
 */
export function protectedThreadRowIds(): ReadonlySet<string> {
  const protectedIds = new Set<string>(pinnedThreadRowIds());
  const state = useAppStore.getState();
  for (const id of auxiliaryThreadIds()) protectedIds.add(id);
  if (state.view.kind === "thread") for (const paneId of state.view.panes) protectedIds.add(paneId);
  for (const [threadId, value] of Object.entries(state.provisioningWorktreeThreadIds)) {
    if (value === true) protectedIds.add(threadId);
  }
  for (const [threadId, pending] of Object.entries(state.pendingThreadLaunches)) {
    if (pending !== undefined) protectedIds.add(threadId);
  }
  for (const threadId of retainedUncertainLaunchThreadIds()) protectedIds.add(threadId);
  return protectedIds;
}
