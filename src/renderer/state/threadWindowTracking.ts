import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import {
  setOwnWindowThreadIds,
  useAuxiliaryThreadWindows,
} from "@/renderer/state/auxiliaryThreadWindows";

let initialIds: Promise<void> = Promise.resolve();

/** Main window only: mirror the thread windows main owns, including after a renderer reload. */
export function installThreadWindowTracking(): () => void {
  const bridge = readBridge();
  let disposed = false;
  let receivedLive = false;
  const apply = (threadIds: readonly string[]) => {
    const previous = useAuxiliaryThreadWindows.getState().ownWindowThreadIds;
    setOwnWindowThreadIds(threadIds);
    // The thread's window may have sent or changed the draft this window still holds.
    for (const threadId of previous)
      if (!threadIds.includes(threadId)) useAppStore.getState().reloadThreadDraftContent(threadId);
  };
  const unsubscribe = bridge.onThreadWindowsChanged?.((event) => {
    receivedLive = true;
    apply(event.threadIds);
  });
  initialIds = Promise.resolve(bridge.getThreadWindowIds?.() ?? null).then((threadIds) => {
    if (threadIds && !disposed && !receivedLive) apply(threadIds);
  });
  initialIds.catch((error: unknown) =>
    captureRendererException(error, { featureArea: "thread-window" }),
  );
  return () => {
    disposed = true;
    unsubscribe?.();
  };
}

/** Settles once main knows which threads have their own window; rejects if that is unknown. */
export function threadWindowIdsLoaded(): Promise<void> {
  return initialIds;
}
