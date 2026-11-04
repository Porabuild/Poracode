import { useAppStore } from "./appStore";
import { useNativeVisualUiStore } from "./nativeVisualUiStore";
import { forgetPendingCatalogEdit } from "./pendingCatalogEdits";
import { clearThreadHistoryNotice } from "./remote/historyNoticeStore";
import { dropPendingThreadLaunch } from "./threadLaunchIntents";

/**
 * Removes a thread row its host authoritatively no longer has, whichever host
 * that is. Never a user command: the confirmation-gated inventory walk decides
 * it. The row goes with everything this client keeps about it: its durable
 * history notice (instead of surviving to re-attach to a future row), a queued
 * create+launch intent, a pending catalog edit and its native visual state.
 */
export function removeConfirmedHostThread(input: {
  /** The row's id in this client's store. */
  readonly viewThreadId: string;
  /** The thread's id on its host. */
  readonly hostThreadId: string;
  /** The host's visual identity, when it has one. */
  readonly visualHostId: string | undefined;
}): void {
  useNativeVisualUiStore.getState().forgetThread(input.visualHostId, input.hostThreadId);
  forgetPendingCatalogEdit("thread", input.viewThreadId);
  useAppStore.getState().deleteThread(input.viewThreadId);
  dropPendingThreadLaunch(input.viewThreadId);
  clearThreadHistoryNotice(input.viewThreadId);
}
