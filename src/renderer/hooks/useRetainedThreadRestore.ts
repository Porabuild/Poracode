import { useEffect, useState, useSyncExternalStore } from "react";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { unprojectRemoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { entityHost } from "@/renderer/state/entityHost";
import { readHostThreadExistence } from "@/renderer/state/hostThreadLaunch";
import {
  getManagedRootCatalogStatus,
  subscribeManagedRootCatalogStatus,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";

/**
 * Resolve a thread outside the loaded catalog page without creating or
 * launching it. `desktopId` names the remote host that owns the thread.
 * `attachRemote` also opens a listed remote thread, which is what subscribes
 * this window to its live transcript; it reattaches when the host reconnects.
 */
export function useRetainedThreadRestore(
  threadId: string,
  desktopId: string | undefined,
  failureMessage: string,
  options?: { attachRemote?: boolean },
) {
  const present = useAppStore((state) => state.threads.some((thread) => thread.id === threadId));
  const remoteStatus = useRemoteServersStore((s) =>
    desktopId ? s.runtime[desktopId]?.status : undefined,
  );
  const rootStatus = useSyncExternalStore(
    subscribeManagedRootCatalogStatus,
    () => getManagedRootCatalogStatus().status,
  );
  const [failure, setFailure] = useState<{ attempt: number; message: string }>();
  const [attempt, setAttempt] = useState(0);
  const needsRestore = !present || (options?.attachRemote === true && desktopId !== undefined);
  useEffect(() => {
    if (!needsRestore || (desktopId ? remoteStatus !== "online" : rootStatus !== "ready")) return;
    let cancelled = false;
    const restore = desktopId
      ? useRemoteServersStore
          .getState()
          .openRemoteThread(desktopId, unprojectRemoteThreadId(desktopId, threadId) ?? threadId, {
            focus: false,
            quiet: true,
          })
      : readManagedThread(threadId);
    void restore
      .then((restored) => {
        if (!restored && !cancelled) setFailure({ attempt, message: failureMessage });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure({ attempt, message: friendlyError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [needsRestore, threadId, desktopId, remoteStatus, rootStatus, attempt, failureMessage]);
  return {
    present,
    error: failure?.attempt === attempt ? failure.message : undefined,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}

/** Reads one thread back from the desktop's own host, which installs its row. */
async function readManagedThread(threadId: string): Promise<boolean> {
  const host = entityHost({ id: threadId });
  if (!host) return false;
  return (await readHostThreadExistence(host, threadId)) === "present";
}
