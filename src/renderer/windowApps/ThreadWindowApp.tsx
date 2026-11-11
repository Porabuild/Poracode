import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import type { ThreadWindowBootstrap } from "@/shared/ipc/threadWindow";
import { AppProvider } from "@/renderer/components/ui/provider";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { ImageLightboxHost } from "@/renderer/components/composer/ImageLightbox";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useRemoteServerConnection } from "@/renderer/hooks/useRemoteServerConnection";
import { useRetainedThreadRestore } from "@/renderer/hooks/useRetainedThreadRestore";
import { useThread } from "@/renderer/state/useThread";
import { reopenStoredThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { setOwnWindowThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { requestsFromRuntimeItems } from "@/renderer/state/remote/runtimeRequests";
import { CompactDndProvider } from "@/renderer/dnd";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";
import { useCloseWhenThreadLeaves } from "./useCloseWhenThreadLeaves";

export function ThreadWindowApp() {
  const { initialConnectSettled } = useRemoteServerConnection();
  const { initialLoading } = useAppHydration({ runtimeOwner: false, prewarmFeatures: false });
  const [entry, setEntry] = useState<ThreadWindowBootstrap | null>(null);
  useEffect(() => {
    void readBridge()
      .getThreadWindowInfo?.()
      .then((info) => {
        if (!info) return;
        // Usage and side chat checks treat this thread as the one with its own window.
        setOwnWindowThreadIds([info.threadId]);
        setEntry(info);
      })
      .catch((error: unknown) => captureRendererException(error, { featureArea: "thread-window" }));
  }, []);
  return (
    <AppProvider contentReady={!initialLoading && entry !== null} syncWindowChrome={false}>
      <div className="flex h-screen min-h-0 flex-col bg-[var(--content-background)] text-foreground">
        {!initialLoading && entry && (!entry.remoteServerId || initialConnectSettled) ? (
          <ThreadWindowBody entry={entry} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <PixelLoader size="sm" />
          </div>
        )}
      </div>
      <ImageLightboxHost />
    </AppProvider>
  );
}

function ThreadWindowBody({ entry }: { entry: ThreadWindowBootstrap }) {
  const { t } = useLingui();
  const restore = useRetainedThreadRestore(
    entry.threadId,
    entry.remoteServerId,
    t`Could not open this thread. Try again.`,
    { attachRemote: true },
  );
  const thread = useThread(entry.threadId);
  const title = thread?.title;
  useEffect(() => {
    document.title = title || entry.title;
  }, [title, entry.title]);
  useCloseWhenThreadLeaves(entry.threadId, thread, restore.error !== undefined);
  const started = useRef(false);
  useEffect(() => {
    if (!thread || started.current) return;
    started.current = true;
    // Show the restored thread in this renderer's own view and clear an unseen
    // "finished" state it may still carry.
    useAppStore.getState().openThreadStandalone(thread.id);
    // Main does not launch a thread that has its own window; this window does.
    // Archive and Done may have stopped it while this window was loading.
    if (thread.status === "inactive") {
      if (!thread.archived && !thread.done) reopenStoredThread(thread.id);
    } else if (thread.presentationMode === "gui" && !thread.remoteServerId)
      void recoverOpenRequests(thread.id).catch((error: unknown) =>
        captureRendererException(error, { featureArea: "thread-window" }),
      );
  }, [thread]);
  if (!restore.present)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {restore.error ? (
          <div className="flex flex-col items-center gap-2">
            <p role="alert" className="text-sm text-danger">
              {restore.error}
            </p>
            <Button size="sm" variant="secondary" onPress={restore.retry}>
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : (
          <PixelLoader size="sm" />
        )}
      </div>
    );
  return (
    <CompactDndProvider>
      <ThreadPane
        threadId={entry.threadId}
        paneCount={1}
        paneAlign="center"
        surface="window"
        onClose={() => window.close()}
      />
    </CompactDndProvider>
  );
}

/**
 * Approvals and questions are live renderer state, so a new window rebuilds the
 * ones a local thread is still waiting on from its saved request rows. Remote
 * threads get the same recovery from their history snapshot.
 */
async function recoverOpenRequests(threadId: string): Promise<void> {
  await hydrateThreadRuntimeItems(threadId);
  useAppStore.setState((state) => {
    const status = state.threads.find((thread) => thread.id === threadId)?.status;
    if (status !== "needs_approval" && status !== "needs_reply") return {};
    if ((state.runtimeRequestsByThread[threadId]?.length ?? 0) > 0) return {};
    const itemsById = state.runtimeItemsByIdByThread[threadId] ?? {};
    const items = (state.runtimeItemIdsByThread[threadId] ?? []).flatMap((id) =>
      itemsById[id] ? [itemsById[id]] : [],
    );
    const requests = requestsFromRuntimeItems(items).map((request) => ({ ...request, threadId }));
    if (requests.length === 0) return {};
    return { runtimeRequestsByThread: { ...state.runtimeRequestsByThread, [threadId]: requests } };
  });
}
