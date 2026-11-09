import { useEffect, useRef } from "react";
import type { Thread } from "@/shared/contracts";

/**
 * Archive, Done and Delete close the thread's pane in the main window, so they
 * close the thread's own window too. A missing thread only counts once
 * restoring it failed; a thread that drops out briefly comes back.
 */
export function useCloseWhenThreadLeaves(thread: Thread | undefined, restoreFailed: boolean) {
  const previous = useRef<Thread | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    if (thread) previous.current = thread;
    if (!before) return;
    const left = thread
      ? (thread.archived && !before.archived) || (thread.done && !before.done)
      : restoreFailed;
    if (left) window.close();
  }, [thread, restoreFailed]);
}
