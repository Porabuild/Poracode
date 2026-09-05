import { startTransition, useEffect } from "react";
import type { AgentStatus } from "@/shared/contracts";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";

import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useWelcomeGateStore } from "@/renderer/state/welcomeGateStore";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AppDndProvider } from "@/renderer/dnd";

import { useKeyboardShortcuts } from "@/renderer/hooks/useKeyboardShortcuts";
import { useGitRefresh } from "@/renderer/hooks/useGitRefresh";
import { useRightPanelThreadLock } from "@/renderer/hooks/useRightPanelThreadLock";
import { useThreadLifecycle } from "@/renderer/hooks/useThreadLifecycle";
import { useDndHandlers } from "@/renderer/hooks/useDndHandlers";
import { useBrowserSync } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync";

import { AppOverlays } from "@/renderer/views/MainView/parts/AppOverlays";
import { WorktreeDeleteDialogs } from "@/renderer/views/MainView/parts/WorktreeDeleteDialogs";
import { PullFromSourceDialog } from "@/renderer/views/MainView/parts/PullFromSourceDialog";
import { MainPageLayout, StalePanelCleanup } from "@/renderer/views/MainView/parts/MainPageLayout";
import { ThreadSearchOverlayHost } from "@/renderer/views/ThreadSearchOverlay/ThreadSearchOverlay";
import { ThreadLiveWorkflowTracker } from "@/renderer/components/thread/ChatPane/parts/items/ActiveSubAgentTile";
import { RendererRuntimeDiagnosticContextSync } from "@/renderer/diagnostics/runtimeContext";

function findMissingWslDistro(distros: readonly string[], statuses: readonly AgentStatus[]) {
  const cachedDistros = new Set(
    statuses.flatMap((status) => (status.envDistro ? [status.envDistro] : [])),
  );
  return distros.find((distro) => !cachedDistros.has(distro));
}

export function MainView(props: {
  storeHydrated: boolean;
  runtimeSnapshotsReady: boolean;
  loadT0: number;
}) {
  const { storeHydrated, runtimeSnapshotsReady, loadT0 } = props;
  const view = useAppStore((state) => state.view);
  const openHome = useAppStore((state) => state.openHome);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const sharedSettingsHydrated = useSharedSettings((state) => state.sharedSettingsHydrated);
  const backgroundWorkReleased = useWelcomeGateStore((state) => state.backgroundWorkReleased);

  useThreadLifecycle(storeHydrated && runtimeSnapshotsReady);
  useKeyboardShortcuts();
  useGitRefresh(storeHydrated);
  useRightPanelThreadLock();
  useBrowserSync();

  const { handleSortEnd, handlePaneDrop, handleMainPanelDrop, handlePanelDockDrop } =
    useDndHandlers();

  useEffect(() => {
    if (!storeHydrated || !sharedSettingsHydrated || !homeScopeEnabled) {
      return;
    }

    void ensureHomeScopeProject().catch(() => undefined);
  }, [storeHydrated, sharedSettingsHydrated, homeScopeEnabled]);

  useEffect(() => {
    // Hold first-launch detection until the welcome animation has settled (or
    // the user dismissed it). `backgroundWorkReleased` is seeded true for
    // returning users, so this only defers on a genuine first launch — the
    // cold detection sweep's process spawns and `agent-detected` re-render
    // churn would otherwise starve the welcome animation's first paint.
    if (!storeHydrated || !backgroundWorkReleased) {
      return;
    }

    // Triggers detection in the supervisor. When cache is available the RPC
    // resolves immediately with the previously-detected statuses so the first
    // ThreadDraft render has real agents instead of the empty initial state.
    // Fresh detection results still arrive via events
    // (windows-agent-statuses, wsl-agent-statuses).
    const wslDistros = parseWslProjectDistrosKey(wslProjectDistrosKey);
    const discoveryStartedAt = performance.now();
    void readBridge()
      .getAgentStatuses(wslDistros)
      .then((response) => {
        if (import.meta.env.DEV) {
          performance.measure(
            `poracode:provider status request${response.fromCache ? " (cached)" : ""}`,
            {
              start: discoveryStartedAt,
            },
          );
        }
        const missingWslDistro = findMissingWslDistro(wslDistros, response.wsl);
        if (response.fromCache) {
          useAgentStatusesStore.getState().hydrateFromCache({
            windows: response.windows,
            wsl: response.wsl,
          });
          if (!missingWslDistro) {
            return;
          }
          useAgentStatusesStore
            .getState()
            .beginFirstLaunchDiscovery({ kind: "wsl", distro: missingWslDistro });
          return;
        }

        useAgentStatusesStore
          .getState()
          .beginFirstLaunchDiscovery(
            missingWslDistro ? { kind: "wsl", distro: missingWslDistro } : undefined,
          );
      })
      .catch(() => undefined);
  }, [storeHydrated, wslProjectDistrosKey, backgroundWorkReleased]);

  console.log(`[renderer] +${Date.now() - loadT0}ms: rendering main UI`);
  return (
    <>
      <RendererRuntimeDiagnosticContextSync />
      <AppDndProvider
        onSidebarSortEnd={handleSortEnd}
        onPaneDrop={handlePaneDrop}
        onMainPanelDrop={handleMainPanelDrop}
        onPanelDockDrop={handlePanelDockDrop}
        paneLayout={
          view.kind === "thread"
            ? (view.paneLayout ?? buildPaneLayoutFromLegacy(view.panes, view.rowLayout))
            : buildPaneLayoutFromLegacy(["__placeholder__"])
        }
      >
        <MainPageLayout onTitleClick={() => startTransition(() => openHome())} />
        <ThreadSearchOverlayHost />
      </AppDndProvider>
      <StalePanelCleanup />
      <AppOverlays />
      <WorktreeDeleteDialogs />
      <PullFromSourceDialog />
      <ExperimentWorkflowTrackers />
    </>
  );
}

function ExperimentWorkflowTrackers() {
  const experiments = useExperimentStore((state) => state.experiments);
  const threads = useAppStore((state) => state.threads);
  const projects = useAppStore((state) => state.projects);
  const threadById = new Map(threads.map((thread) => [thread.id, thread] as const));
  const projectById = new Map(projects.map((project) => [project.id, project] as const));

  return Object.values(experiments).flatMap((experiment) =>
    experiment.candidates.map((candidate) => {
      const thread = threadById.get(candidate.threadId);
      const project = projectById.get(experiment.projectId);
      if (!thread?.worktreePath || !project) return null;
      return (
        <ThreadLiveWorkflowTracker
          key={candidate.threadId}
          threadId={candidate.threadId}
          projectLocation={buildWorktreeLocation(project.location, thread.worktreePath)}
        />
      );
    }),
  );
}
