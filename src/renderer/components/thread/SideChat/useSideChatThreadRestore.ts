import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost } from "@/renderer/state/entityHost";
import { readHostThreadExistence } from "@/renderer/state/hostThreadLaunch";
import { useEntityHostReady } from "@/renderer/hooks/useEntityHostReady";

/** Resolve a retained child outside the loaded catalog page without creating or launching it. */
export function useSideChatThreadRestore(threadId: string, source: Thread) {
  const { t } = useLingui();
  const present = useAppStore((state) => state.threads.some((thread) => thread.id === threadId));
  // The child lives on its source's host, whichever host that is.
  const hostReady = useEntityHostReady(source);
  const sourceServerId = source.remoteServerId;
  const sourceRemoteId = source.remoteId;
  const [failure, setFailure] = useState<{ attempt: number; message: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (present || !hostReady) return;
    let cancelled = false;
    const sourceHost = entityHost({
      id: source.id,
      remoteServerId: sourceServerId,
      remoteId: sourceRemoteId,
    });
    const childHostId = sourceHost?.hostThreadId(threadId);
    const childHost =
      sourceHost && childHostId
        ? entityHost({
            id: threadId,
            ...(sourceHost.connectionKey
              ? { remoteServerId: sourceHost.connectionKey, remoteId: childHostId }
              : {}),
          })
        : undefined;
    const restore = childHost
      ? readHostThreadExistence(childHost, threadId).then((existence) => existence === "present")
      : Promise.resolve(false);
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
  }, [present, threadId, source.id, sourceServerId, sourceRemoteId, hostReady, attempt, t]);
  return {
    present,
    error: failure?.attempt === attempt ? failure.message : undefined,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
