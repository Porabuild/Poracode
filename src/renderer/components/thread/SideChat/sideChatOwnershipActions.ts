import { deleteThread, deleteThreadRecord } from "@/renderer/actions/threadActions";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { setAuxiliaryThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
import { managedRootHistoryActivation } from "@/renderer/state/managedRootCatalog/rootHistory";
import { subscribeManagedRootCatalogStatus } from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { SideChatWindowsChanged } from "@/shared/ipc/sideChat";
import type { Thread } from "@/shared/contracts";
import { applySideChatPanel, useSideChatPanelStore } from "./sideChatPanelStore";

const pendingDisposals = new Map<string, Thread>();
const disposing = new Set<string>();
const checkingParents = new Set<string>();
const report = (error: unknown) => captureRendererException(error, { featureArea: "side-chat" });

function retryDisposals() {
  for (const thread of pendingDisposals.values()) {
    if (disposing.has(thread.id)) continue;
    disposing.add(thread.id);
    void deleteThreadRecord(thread)
      .then(async () => {
        await readBridge().releaseSideChatThread?.(thread.id);
        pendingDisposals.delete(thread.id);
      })
      .catch(report)
      .finally(() => disposing.delete(thread.id));
  }
}

function reconcileParents() {
  for (const entry of Object.values(useSideChatPanelStore.getState().entries)) {
    const sourceId = entry.source.id;
    const state = useAppStore.getState();
    if (
      state.pendingThreadLaunches[sourceId] !== undefined ||
      state.threads.some((thread) => thread.id === sourceId && thread.status === "launching")
    )
      continue;
    if (checkingParents.has(sourceId)) continue;
    checkingParents.add(sourceId);
    const owner = remoteOwner(entry.source);
    const activation = owner ? null : managedRootHistoryActivation();
    const read = owner
      ? useRemoteServersStore
          .getState()
          .withClient(owner.desktopId, (client) =>
            client.boundedCatalogMembership({ threadIds: [owner.remoteId], projectIds: [] }),
          )
      : activation?.client.boundedCatalogMembership({ threadIds: [sourceId], projectIds: [] });
    void read
      ?.then(async (membership) => {
        if (!owner && managedRootHistoryActivation() !== activation) return;
        if (!membership.existingThreadIds.includes(owner?.remoteId ?? sourceId))
          await readBridge().closeSideChatPanel?.(sourceId);
      })
      .catch(() => {
        // Disconnection is not authoritative absence; retain the attachment.
      })
      .finally(() => checkingParents.delete(sourceId));
    if (!read) checkingParents.delete(sourceId);
  }
}

export function applyNativeSideChatOwnership(event: SideChatWindowsChanged, mainWindow: boolean) {
  setAuxiliaryThreadIds(event.threadIds, event.hiddenThreadIds);
  if (!mainWindow) return;
  if (event.panel !== undefined) applySideChatPanel(event.panel, event.panels, event.detachedIds);
  for (const thread of event.disposing ?? []) pendingDisposals.set(thread.id, thread);
  retryDisposals();
  if (
    event.closedThreadId &&
    !event.disposing?.some((thread) => thread.id === event.closedThreadId)
  )
    deleteThread(event.closedThreadId);
  reconcileParents();
}

/** Retry after reconnect, and verify parent removal against host membership rather than loaded pages. */
export function installSideChatOwnershipReconciliation(): () => void {
  const root = subscribeManagedRootCatalogStatus(() => {
    retryDisposals();
    reconcileParents();
  });
  const remote = useRemoteServersStore.subscribe((state, previous) => {
    if (
      Object.entries(state.runtime).some(
        ([id, runtime]) =>
          runtime?.status === "online" && previous.runtime[id]?.status !== "online",
      )
    ) {
      retryDisposals();
      reconcileParents();
    }
  });
  const app = useAppStore.subscribe((state, previous) => {
    if (state.threads === previous.threads) return;
    const parentIds = Object.keys(useSideChatPanelStore.getState().entries);
    if (
      parentIds.some(
        (id) =>
          previous.threads.some((thread) => thread.id === id) &&
          !state.threads.some((thread) => thread.id === id),
      )
    )
      reconcileParents();
  });
  return () => {
    root();
    remote();
    app();
  };
}
