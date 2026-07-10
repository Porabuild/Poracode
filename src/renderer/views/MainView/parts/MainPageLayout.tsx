import { Suspense, type ReactNode, useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/react";
import { getAppName } from "@/shared/appName";
import { readBridge } from "@/renderer/bridge";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { Sidebar } from "@/renderer/views/MainView/parts/Sidebar/Sidebar";
import { AppContent } from "@/renderer/views/MainView/parts/AppContent/AppContent";
import { SidebarHeaderControls } from "@/renderer/views/MainView/parts/SidebarHeaderControls";
import { MainRightPanel } from "@/renderer/views/MainView/parts/MainRightPanel";
import { MainGitPanel } from "@/renderer/views/MainView/parts/MainGitPanel";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProjectIds } from "@/renderer/state/useThread";
import { closeAllPanels, dismissRightOverlay } from "@/renderer/actions/panelActions";
import { setMainPanelDropZoneElement, useIsMainPanelDropActive } from "@/renderer/dnd";
import { DeferredFileEditorPanel } from "@/renderer/deferredFeatures";

export function MainPageLayout(props: { onTitleClick: () => void }) {
  const { onTitleClick } = props;
  const channel = readBridge().channel;
  const isDev = import.meta.env.DEV;
  // Keep the dev / nightly tag beside the brand wordmark (the old text header
  // rendered it inline as "(DEV)" / "Nightly").
  const channelSuffix = [channel === "nightly" ? "Nightly" : "", isDev ? "(dev)" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <PageLayout
      title={getAppName(channel, isDev)}
      titleNode={
        <span className="inline-flex items-baseline gap-1.5">
          <BrandWordmark className="text-sm text-foreground" />
          {channelSuffix ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              {channelSuffix}
            </span>
          ) : null}
        </span>
      }
      onTitleClick={onTitleClick}
      onRequestClosePanels={closeAllPanels}
      onDismissRightOverlay={dismissRightOverlay}
      sidebarHeaderChildren={<SidebarHeaderControls />}
      sidebar={<Sidebar />}
      content={
        <MainPanelDropZone>
          <AppContent />
          <Suspense>
            <DeferredFileEditorPanel />
          </Suspense>
        </MainPanelDropZone>
      }
      rightPanel={<MainRightPanel />}
      gitPanel={<MainGitPanel />}
    />
  );
}

function MainPanelDropZone(props: { children: ReactNode }) {
  const elementRef = useRef<HTMLDivElement>(null);
  // The dnd-kit registration keeps the source from going into "no valid
  // target" cancellation; pointer hit-testing is done by the dnd module via
  // the element registered through `setMainPanelDropZoneElement` below.
  useDroppable({
    id: "main-panel-drop-zone",
    accept: "sidebar-panel",
    data: { type: "main-panel-drop-zone" },
    element: elementRef,
  });
  const isActive = useIsMainPanelDropActive();

  useEffect(() => {
    setMainPanelDropZoneElement(elementRef.current);
    return () => setMainPanelDropZoneElement(null);
  }, []);

  return (
    <div ref={elementRef} className="relative h-full min-h-0">
      {props.children}
      {isActive ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-20 rounded border border-accent/70 bg-accent/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
        />
      ) : null}
    </div>
  );
}

export function StalePanelCleanup() {
  const projectIds = useProjectIds();
  const fileEditorRootContext = useFileEditorStore((state) => state.rootContext);
  const clearFileEditorSession = useFileEditorStore((state) => state.clearSession);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitOverlayOpen = usePanelStore((s) => s.gitOverlayOpen);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);

  useEffect(() => {
    const projectIdSet = new Set(projectIds);
    const panelStore = usePanelStore.getState();

    if (gitReviewContext && !projectIdSet.has(gitReviewContext.projectId)) {
      panelStore.setGitOverlayOpen(false);
      panelStore.setGitReviewContext(null);
    } else if (!gitReviewContext && gitOverlayOpen) {
      panelStore.setGitOverlayOpen(false);
    }

    if (filesPanelContext && !projectIdSet.has(filesPanelContext.projectId)) {
      panelStore.setFilesPanelContext(null);
    }

    if (fileEditorRootContext && !projectIdSet.has(fileEditorRootContext.projectId)) {
      clearFileEditorSession();
    }
  }, [
    clearFileEditorSession,
    fileEditorRootContext,
    filesPanelContext,
    gitOverlayOpen,
    gitReviewContext,
    projectIds,
  ]);

  return null;
}
