import { startTransition, useEffect } from "react";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";

import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AppDndProvider } from "@/renderer/dnd";

import { useAgentStatusHydration } from "@/renderer/hooks/useAgentStatusHydration";
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
  useAgentStatusHydration(wslProjectDistrosKey, storeHydrated);

  const { handleSortEnd, handlePaneDrop, handleMainPanelDrop } = useDndHandlers();

  useEffect(() => {
    if (!storeHydrated || !sharedSettingsHydrated || !homeScopeEnabled) {
      return;
    }

    void ensureHomeScopeProject().catch(() => undefined);
  }, [storeHydrated, sharedSettingsHydrated, homeScopeEnabled]);

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
