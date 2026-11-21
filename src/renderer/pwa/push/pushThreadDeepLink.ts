import { useEffect, useRef, useState } from "react";
import { openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";

/** The host's web-push alert opens `${webAppBasePath}/thread/<hostThreadId>`. */
export function parsePushThreadPath(
  pathname: string,
): { threadId: string; homePath: string } | null {
  const match = /^(.*?)\/thread\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return null;
  let threadId: string;
  try {
    threadId = decodeURIComponent(match[2] ?? "");
  } catch {
    return null;
  }
  if (threadId.length === 0 || threadId.length > 512) return null;
  return { threadId, homePath: `${match[1] ?? ""}/` };
}

export interface PushThreadOpenDeps {
  /** App rows, including projected remote rows (`remoteId` is the host id). */
  readonly threads: readonly {
    readonly id: string;
    readonly remoteId?: string | undefined;
    readonly remoteServerId?: string | undefined;
  }[];
  /** Connection keys of hosts currently online. */
  readonly onlineConnections: readonly string[];
  readonly openLocalThread: (threadId: string) => void;
  /** Loads history for a host thread and installs its app row. */
  readonly openRemoteThread: (connectionKey: string, remoteId: string) => Promise<boolean>;
}

/**
 * Resolve a notification's host thread id to an open app view. A cached row is
 * preferred (with an online owner first); otherwise the history is loaded from
 * the online host that owns it. Returns whether a thread was opened.
 */
export async function openPushThreadTarget(
  threadId: string,
  deps: PushThreadOpenDeps,
): Promise<boolean> {
  const online = new Set(deps.onlineConnections);
  const localRows = deps.threads
    .filter((thread) => thread.id === threadId || thread.remoteId === threadId)
    .sort((left, right) => {
      const leftOnline = left.remoteServerId ? online.has(left.remoteServerId) : true;
      const rightOnline = right.remoteServerId ? online.has(right.remoteServerId) : true;
      return Number(rightOnline) - Number(leftOnline);
    });
  if (localRows[0]) {
    deps.openLocalThread(localRows[0].id);
    return true;
  }
  for (const connectionKey of deps.onlineConnections) {
    if (await deps.openRemoteThread(connectionKey, threadId)) {
      deps.openLocalThread(remoteThreadId(connectionKey, threadId));
      return true;
    }
  }
  return false;
}

/**
 * A notification click navigates the installed PWA to `/thread/<hostThreadId>`.
 * Resolve it after the paired host(s) and catalog are available, open the
 * thread, and replace the path with the app home so a later reload does not
 * reopen an old notification.
 */
export function usePushThreadDeepLink(): void {
  // The notification URL is fixed for this document load; a later navigation
  // (including the replace below) must not re-target the effect.
  const [target] = useState(() => parsePushThreadPath(window.location.pathname));
  const threads = useAppStore((state) => state.threads);
  const servers = useRemoteServersStore((state) => state.servers);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const attemptedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!target || doneRef.current || busyRef.current || servers.length === 0) return;
    const onlineConnections = servers
      .map(remoteConnectionKey)
      .filter((key) => runtime[key]?.status === "online");
    // Retry only when the inputs that can change the outcome change: a host
    // comes online/offline, or the catalog starts carrying a matching row. A
    // thread that is gone stays gone — a runtime update must not re-read it on
    // every refresh for the rest of the session.
    const hasCachedRow = threads.some(
      (thread) => thread.id === target.threadId || thread.remoteId === target.threadId,
    );
    const attemptKey = `${onlineConnections.join("\u0000")}\u0001${hasCachedRow ? "cached" : "cold"}`;
    if (attemptedKeyRef.current === attemptKey) return;
    attemptedKeyRef.current = attemptKey;
    busyRef.current = true;
    void openPushThreadTarget(target.threadId, {
      threads,
      onlineConnections,
      openLocalThread: (threadId) =>
        openThread(threadId, { focusComposer: false, switchWorkspace: true }),
      openRemoteThread: (connectionKey, remoteId) =>
        useRemoteServersStore.getState().openRemoteThread(connectionKey, remoteId, {
          focus: false,
          quiet: true,
        }),
    })
      .then((opened) => {
        if (!opened) return;
        doneRef.current = true;
        window.history.replaceState(null, "", target.homePath);
      })
      .catch(() => undefined)
      .finally(() => {
        busyRef.current = false;
      });
  }, [target, servers, runtime, threads]);
}
