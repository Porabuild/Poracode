import { useEffect, useState, useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner, unprojectRemoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { resolveManagedRootThreadPin } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import {
  getManagedRootCatalogStatus,
  subscribeManagedRootCatalogStatus,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";

/** Resolve a retained child outside the loaded catalog page without creating or launching it. */
export function useSideChatThreadRestore(threadId: string, source: Thread) {
  const { t } = useLingui();
  const present = useAppStore((state) => state.threads.some((thread) => thread.id === threadId));
  const desktopId = remoteOwner(source)?.desktopId;
  const remoteStatus = useRemoteServersStore((s) =>
    desktopId ? s.runtime[desktopId]?.status : undefined,
  );
  const rootStatus = useSyncExternalStore(
    subscribeManagedRootCatalogStatus,
    () => getManagedRootCatalogStatus().status,
  );
  const [failure, setFailure] = useState<{ attempt: number; message: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (present || (desktopId ? remoteStatus !== "online" : rootStatus !== "ready")) return;
    let cancelled = false;
    const restore = desktopId
      ? useRemoteServersStore
          .getState()
          .openRemoteThread(desktopId, unprojectRemoteThreadId(desktopId, threadId) ?? threadId, {
            focus: false,
            quiet: true,
          })
      : resolveManagedRootThreadPin(threadId);
    void restore
      .then((restored) => {
        if (!restored && !cancelled)
          setFailure({
            attempt,
            message: t`Could not read the thread context for side chat. Try again.`,
          });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure({ attempt, message: friendlyError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [present, threadId, desktopId, remoteStatus, rootStatus, attempt, t]);
  return {
    present,
    error: failure?.attempt === attempt ? failure.message : undefined,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
