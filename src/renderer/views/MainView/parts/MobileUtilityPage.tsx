import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { Trans } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import {
  SubAgentContent,
  SubAgentOpenController,
} from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { loadRuntimeItemThroughHistory } from "@/renderer/components/thread/ChatPane/loadRuntimeItemThroughHistory";
import { useThreadRuntimeItem } from "@/renderer/state/useThreadRuntimeItem";
import { getProjectMap, getThreadMap } from "@/renderer/state/useThread";
import { retainRuntimeThreadReader } from "@/renderer/state/runtimeInterestHydration";
import { runtimeWindowPageCursor } from "@/renderer/state/runtimeHistoryPaging";
import { parseProjectedRemoteEntityId } from "@/renderer/state/remoteProjection";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { retryManagedRootCatalog } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { ManagedRootCatalogStatusNotice } from "@/renderer/state/managedRootCatalog/ManagedRootCatalogStatusNotice";
import { showSubAgentPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { selectPullRequestsOverlayVisible, usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSettingsHostServer, useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { selectCurrentProjectIdForView } from "@/renderer/actions/currentProject";
import { BrowserDockSlot } from "./RightPanel/parts/BrowserPanel/BrowserDockSlot";
import { BrowserPanel } from "./RightPanel/parts/BrowserPanel/BrowserPanel";
import {
  extractBrowserToWindow,
  injectBrowserToMain,
} from "./RightPanel/parts/BrowserPanel/browserWindowActions";
import { NotesPanel } from "./RightPanel/parts/NotesPanel/NotesPanel";
import { PortsPanel } from "./RightPanel/parts/PortsPanel/PortsPanel";
import { UsagePanel } from "./RightPanel/parts/UsagePanel/UsagePanel";
import { MobileRemoteProjectsPage } from "../../SettingsOverlay/parts/MobileRemoteProjectsSheet";
import { PullRequestsView } from "../../PullRequestsView/PullRequestsView";
import { SchedulesView } from "../../SchedulesView/SchedulesView";
import { BrowserRemoteConnectionGate } from "./BrowserRemoteConnectionGate";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { MobileProjectPicker } from "@/renderer/components/common/MobileProjectPicker";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { RemoteServerPicker } from "@/renderer/components/common/RemoteServerPicker";
import { ProfileSettings } from "../../SettingsOverlay/parts/ProfileSettings";
import { isHomeProject } from "@/shared/homeScope";
import { DeferredDevTerminalPanel } from "@/renderer/deferredFeatures";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";

/**
 * Compact-PWA presentation for destinations that are desktop side panels.
 * The underlying feature components stay shared; only their navigation shell
 * changes from docked panel to a full mobile page.
 */
export function MobileUtilityPage() {
  // The pull-request overlay stacks over this page, so the page must not stay
  // reachable by keyboard or screen reader underneath it. The wrapper is box-less
  // and always mounted, so covering the page never remounts its state.
  const covered = usePanelStore(selectPullRequestsOverlayVisible);
  return (
    <div className="contents" aria-hidden={covered || undefined} inert={covered}>
      <MobileUtilityPageContent />
    </div>
  );
}

function MobileUtilityPageContent() {
  const page = usePanelStore((state) => state.mobileUtilityPage);
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore(selectCurrentProjectIdForView);
  const browserExtracted = useBrowserPanelStore((state) => state.extracted);
  const firstServer = useRemoteServersStore((state) => state.servers[0]);
  const chooseSettingsHost = useSettingsHostStore((state) => state.choose);
  const [selectedNotesProjectId, setSelectedNotesProjectId] = useState<string | null>(null);
  const selectedServer = useSettingsHostServer() ?? firstServer;
  const projectRuntime = useRemoteServersStore((state) =>
    selectedServer ? state.runtime[remoteConnectionKey(selectedServer)] : undefined,
  );
  const lastKnownProjects = useRemoteServersStore((state) =>
    selectedServer ? state.lastKnownProjects[remoteConnectionKey(selectedServer)] : undefined,
  );

  const changeDesktop = (desktopId: string | null) => {
    if (desktopId) chooseSettingsHost(desktopId);
  };

  if (page === "usage") return <UsagePanel />;

  if (page === "terminal") {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <PixelLoader size="lg" />
          </div>
        }
      >
        <DeferredDevTerminalPanel
          hideHeader
          positionOverride="mobile"
          onEmpty={() => usePanelStore.getState().closeMobileUtilityPage()}
        />
      </Suspense>
    );
  }

  if (page === "profile") {
    return (
      <BrowserRemoteConnectionGate allowOffline>
        <div className="m-settings__body m-page-scroll-surface">
          <ProfileSettings />
        </div>
      </BrowserRemoteConnectionGate>
    );
  }

  if (page === "browser") {
    return (
      <>
        {selectedServer ? (
          <MobilePageHeaderActions>
            <RemoteServerPicker
              value={selectedServer.desktopId}
              onChange={changeDesktop}
              opensUpward
            />
          </MobilePageHeaderActions>
        ) : null}
        {browserExtracted ? (
          <BrowserDockSlot
            extracted={browserExtracted}
            onBringBack={injectBrowserToMain}
            onFocusWindow={extractBrowserToWindow}
          />
        ) : (
          <BrowserPanel visible />
        )}
      </>
    );
  }

  if (page === "ports") return <PortsPanel />;

  if (page === "notes") {
    const notesProjects = projects.filter(
      (project) => !project.disabled && !isHomeProject(project),
    );
    const project =
      notesProjects.find((candidate) => candidate.id === selectedNotesProjectId) ??
      notesProjects.find((candidate) => candidate.id === currentProjectId) ??
      notesProjects.find(
        (candidate) =>
          candidate.remoteServerId ===
          (selectedServer ? remoteConnectionKey(selectedServer) : undefined),
      ) ??
      notesProjects[0];
    return project ? (
      <BrowserRemoteConnectionGate allowOffline>
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 pb-[calc(var(--m-floating-control-height)+1.5rem+env(safe-area-inset-bottom))]">
            <NotesPanel key={project.id} projectId={project.id} />
          </div>
          <div className="m-utility-floating-actions m-utility-floating-actions--centered">
            <MobileProjectPicker
              projects={notesProjects}
              selectedProject={project}
              onChange={setSelectedNotesProjectId}
            />
          </div>
        </div>
      </BrowserRemoteConnectionGate>
    ) : null;
  }

  if (page === "pullRequests" && selectedServer) {
    // The list scrolls itself and owns its floating bottom row, so it gets the
    // page without the generic utility padding that would lift that row.
    return (
      <div className="relative h-full min-h-0">
        <BrowserRemoteConnectionGate allowOffline>
          <PullRequestsView
            key={remoteConnectionKey(selectedServer)}
            remoteDesktopId={remoteConnectionKey(selectedServer)}
            onRemoteDesktopChange={changeDesktop}
          />
        </BrowserRemoteConnectionGate>
      </div>
    );
  }

  if (page === "schedules" && selectedServer) {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="m-utility-page min-h-0 flex-1 overflow-y-auto">
          <BrowserRemoteConnectionGate allowOffline>
            <SchedulesView
              key={remoteConnectionKey(selectedServer)}
              remoteDesktopId={remoteConnectionKey(selectedServer)}
              onRemoteDesktopChange={changeDesktop}
            />
          </BrowserRemoteConnectionGate>
        </div>
      </div>
    );
  }

  if (page === "projects" && selectedServer) {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <MobileRemoteProjectsPage
            server={selectedServer}
            projects={projectRuntime?.projects ?? lastKnownProjects ?? []}
            isOnline={projectRuntime?.status === "online"}
            onClose={() => usePanelStore.getState().closeMobileUtilityPage()}
          />
        </div>
        <MobileMachineToolbar
          desktopId={remoteConnectionKey(selectedServer)}
          onDesktopChange={changeDesktop}
        />
      </div>
    );
  }

  if (page === "subagent") return <SubAgentPage />;

  return null;
}

/**
 * Compact presentation of an existing delegated transcript. The shared
 * SubAgentContent keeps one mount per target, while this page owns the parent
 * thread's runtime reader and the bounded-history lookup for a target that may
 * sit outside the newest host page.
 */
function SubAgentPage() {
  const context = usePanelStore((state) => state.subAgentPanelContext);
  const threadId = context?.threadId ?? "";
  const parentItemId = context?.parentItemId ?? "";
  const thread = useAppStore((state) =>
    threadId ? getThreadMap(state.threads).get(threadId) : undefined,
  );
  const project = useAppStore((state) =>
    thread ? getProjectMap(state.projects).get(thread.projectId) : undefined,
  );
  const item = useThreadRuntimeItem(threadId, parentItemId);
  const [retryNonce, setRetryNonce] = useState(0);
  const remoteOwner = context
    ? parseProjectedRemoteEntityId(context.threadId, "thread")
    : undefined;
  const remoteRuntime = useRemoteServersStore((state) =>
    remoteOwner ? state.runtime[remoteOwner.desktopId] : undefined,
  );
  const ownerThreadId = thread?.id;
  const targetPresent = threadId.length > 0 && parentItemId.length > 0;
  // The owning thread's reader lives for the whole page and its retry, not for
  // each selected parent; nested targets reuse the same authoritative reader.
  const readerKey = `${ownerThreadId ?? ""}\0${retryNonce}`;
  const [readerResult, setReaderResult] = useState<{
    key: string;
    state: "ready" | "failed";
  } | null>(null);
  const readerState = readerResult?.key === readerKey ? readerResult.state : "waiting";
  const targetKey = `${threadId}\0${parentItemId}\0${readerState}\0${retryNonce}`;
  const [targetResult, setTargetResult] = useState<{
    key: string;
    state: "exhausted" | "failed";
  } | null>(null);
  const targetState =
    item !== undefined
      ? "idle"
      : targetResult?.key === targetKey
        ? targetResult.state
        : readerState === "ready"
          ? "searching"
          : "idle";

  // AppContent replaces ChatPane with this utility page, so the parent
  // thread's bounded history/live-stream interest has no ChatPane owner. Keep
  // exactly one reader for the owning thread and release it on owner/retry
  // change or unmount.
  useEffect(() => {
    if (!ownerThreadId || !targetPresent) return;
    let cancelled = false;
    let stopStatusWatch: (() => void) | undefined;
    const key = readerKey;
    const reader = retainRuntimeThreadReader(ownerThreadId);
    const settled = (ready: boolean | void) => {
      if (cancelled) return;
      if (ready === false) {
        setReaderResult({ key, state: "failed" });
        return;
      }
      const status = () => useAppStore.getState().runtimeHydrationStatus[ownerThreadId];
      // An authoritative recovery resolves void while its baseline is still
      // pending. Page history only after that baseline settles, not against a
      // half-restored snapshot.
      if (ready === undefined && status() === "pending") {
        stopStatusWatch = useAppStore.subscribe((state) => {
          const next = state.runtimeHydrationStatus[ownerThreadId];
          if (next === "pending") return;
          stopStatusWatch?.();
          stopStatusWatch = undefined;
          if (!cancelled) {
            setReaderResult({ key, state: next === "failed" ? "failed" : "ready" });
          }
        });
        return;
      }
      setReaderResult({ key, state: status() === "failed" ? "failed" : "ready" });
    };
    void reader.ready.then(settled, () => {
      if (!cancelled) setReaderResult({ key, state: "failed" });
    });
    return () => {
      cancelled = true;
      stopStatusWatch?.();
      reader.release();
    };
  }, [ownerThreadId, readerKey, targetPresent]);

  useEffect(() => {
    if (!ownerThreadId) return;
    const app = useAppStore.getState();
    if (
      app.view.kind === "thread" &&
      app.focusedPaneId === ownerThreadId &&
      app.view.panes.includes(ownerThreadId)
    ) {
      return;
    }
    app.openThread(ownerThreadId);
  }, [ownerThreadId]);

  // A restored target can be older than the host's newest runtime page. Page
  // history after the retained reader is ready; cancellation/identity fencing
  // prevents a switched target or dismissed page from updating this one.
  useEffect(() => {
    if (!ownerThreadId || !threadId || !parentItemId || readerState !== "ready" || item) return;
    let cancelled = false;
    const key = targetKey;
    const isCurrent = () =>
      !cancelled &&
      usePanelStore.getState().subAgentPanelContext?.threadId === threadId &&
      usePanelStore.getState().subAgentPanelContext?.parentItemId === parentItemId;
    void loadRuntimeItemThroughHistory(threadId, parentItemId, isCurrent)
      .then((loaded) => {
        // Cancellation and a switched parent are fenced by isCurrent(), not
        // only by the effect cleanup, so a stale read cannot set this target's
        // exhausted/failed state.
        if (isCurrent() && !loaded) {
          setTargetResult({
            key,
            state: runtimeWindowPageCursor(threadId) === null ? "exhausted" : "failed",
          });
        }
      })
      .catch(() => {
        if (isCurrent()) setTargetResult({ key, state: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [item, ownerThreadId, parentItemId, readerState, targetKey, threadId]);

  // Back/unmount is the only dismiss owner; clear a queued nested-row action so
  // it cannot fire into a later page.
  useEffect(() => {
    if (!threadId) return;
    return () => {
      useAppStore.getState().closeSubAgent(threadId);
    };
  }, [threadId]);

  const retryOwner = () => {
    if (remoteOwner) {
      void useRemoteServersStore
        .getState()
        .openRemoteThread(remoteOwner.desktopId, remoteOwner.remoteId, { quiet: true });
    } else if (isManagedRootDesktopRuntime()) {
      retryManagedRootCatalog();
    }
    setRetryNonce((value) => value + 1);
  };

  const openNested = (nestedParentItemId: string, projectLocation: ProjectLocation | undefined) => {
    if (!context) return;
    showSubAgentPanel(context.threadId, nestedParentItemId, projectLocation);
  };

  let body: ReactNode;
  if (!context || !threadId || !parentItemId) {
    body = <SubAgentUnavailable onRetry={retryOwner} />;
  } else if (!thread) {
    if (remoteOwner) {
      const status = remoteRuntime?.status;
      if (status === undefined || status === "connecting") {
        body = <SubAgentLoading />;
      } else if (status === "offline" || status === "error") {
        body = <SubAgentUnavailable message={<Trans>Offline</Trans>} onRetry={retryOwner} />;
      } else {
        body = <SubAgentUnavailable onRetry={retryOwner} />;
      }
    } else if (isManagedRootDesktopRuntime()) {
      body = (
        <ManagedRootCatalogStatusNotice fallback={<SubAgentUnavailable onRetry={retryOwner} />} />
      );
    } else {
      body = <SubAgentUnavailable onRetry={retryOwner} />;
    }
  } else if (item) {
    body = (
      <SubAgentContent
        key={`${context.threadId}:${context.parentItemId}`}
        threadId={context.threadId}
        parentItemId={context.parentItemId}
        hideHeader
        visible
        initialScrollRevealDelayMs={0}
      />
    );
  } else if (readerState === "failed") {
    body = <SubAgentUnavailable onRetry={() => setRetryNonce((value) => value + 1)} />;
  } else if (readerState !== "ready" || targetState === "searching") {
    body = <SubAgentLoading />;
  } else if (targetState === "failed") {
    body = <SubAgentUnavailable onRetry={() => setRetryNonce((value) => value + 1)} />;
  } else {
    body = <SubAgentUnavailable />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" title={project?.name}>
      {context ? <SubAgentOpenController threadId={context.threadId} onOpen={openNested} /> : null}
      {body}
    </div>
  );
}

function SubAgentLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center" role="status">
      <PixelLoader size="lg" />
    </div>
  );
}

function SubAgentUnavailable(props: { message?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted">{props.message ?? <Trans>Subagent not found.</Trans>}</p>
        {props.onRetry ? (
          <Button size="sm" variant="secondary" onPress={props.onRetry}>
            <Trans>Retry</Trans>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
