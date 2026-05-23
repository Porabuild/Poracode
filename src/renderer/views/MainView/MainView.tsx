import { startTransition, useEffect } from "react";
import type { AgentStatus } from "@/shared/contracts";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import { readBridge } from "@/renderer/bridge";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";

import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AppDndProvider } from "@/renderer/dnd";

import { useKeyboardShortcuts } from "@/renderer/hooks/useKeyboardShortcuts";
import { useWslDetection } from "@/renderer/hooks/useWslDetection";
import { useGitRefresh } from "@/renderer/hooks/useGitRefresh";
import { useThreadLifecycle } from "@/renderer/hooks/useThreadLifecycle";
import { useDndHandlers } from "@/renderer/hooks/useDndHandlers";
import { useBrowserSync } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync";

import { AppOverlays } from "@/renderer/views/MainView/parts/AppOverlays";
import { WorktreeDeleteDialogs } from "@/renderer/views/MainView/parts/WorktreeDeleteDialogs";
import { PullFromSourceDialog } from "@/renderer/views/MainView/parts/PullFromSourceDialog";
import { MainPageLayout, StalePanelCleanup } from "@/renderer/views/MainView/parts/MainPageLayout";
import { ThreadSearchOverlayHost } from "@/renderer/views/ThreadSearchOverlay/ThreadSearchOverlay";

function findMissingWslDistro(distros: readonly string[], statuses: readonly AgentStatus[]) {
  const cachedDistros = new Set(
    statuses.flatMap((status) => (status.envDistro ? [status.envDistro] : [])),
  );
  return distros.find((distro) => !cachedDistros.has(distro));
}

export function MainView(props: { storeHydrated: boolean; loadT0: number }) {
  const { storeHydrated, loadT0 } = props;
  const view = useAppStore((state) => state.view);
  const openHome = useAppStore((state) => state.openHome);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const sharedSettingsHydrated = useSharedSettings((state) => state.sharedSettingsHydrated);

  useThreadLifecycle(storeHydrated);
  const { wslAvailable } = useWslDetection(storeHydrated);
  useKeyboardShortcuts();
  useGitRefresh(storeHydrated);
  useBrowserSync();

  const { handleSortEnd, handlePaneDrop, handleMainPanelDrop } = useDndHandlers();

  useEffect(() => {
    if (!storeHydrated || !sharedSettingsHydrated || !homeScopeEnabled) {
      return;
    }

    void ensureHomeScopeProject().catch(() => undefined);
  }, [storeHydrated, sharedSettingsHydrated, homeScopeEnabled]);

  useEffect(() => {
    if (!storeHydrated) {
      return;
    }

    // Triggers detection in the supervisor. When cache is available the RPC
    // resolves immediately with the previously-detected statuses so the first
    // ThreadDraft render has real agents instead of the empty initial state.
    // Fresh detection results still arrive via events
    // (windows-agent-statuses, wsl-agent-statuses).
    const wslDistros = parseWslProjectDistrosKey(wslProjectDistrosKey);
    void readBridge()
      .getAgentStatuses(wslDistros)
      .then((response) => {
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
  }, [storeHydrated, wslProjectDistrosKey]);

  console.log(`[renderer] +${Date.now() - loadT0}ms: rendering main UI`);
  return (
    <>
      <AppDndProvider
        onSidebarSortEnd={handleSortEnd}
        onPaneDrop={handlePaneDrop}
        onMainPanelDrop={handleMainPanelDrop}
        paneLayout={
          view.kind === "thread"
            ? (view.paneLayout ?? buildPaneLayoutFromLegacy(view.panes, view.rowLayout))
            : buildPaneLayoutFromLegacy(["__placeholder__"])
        }
      >
        <MainPageLayout
          wslAvailable={wslAvailable}
          onTitleClick={() => startTransition(() => openHome())}
        />
        <ThreadSearchOverlayHost />
      </AppDndProvider>
      <StalePanelCleanup />
      <AppOverlays />
      <WorktreeDeleteDialogs />
      <PullFromSourceDialog />
    </>
  );
}
