import { Suspense } from "react";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  DeferredGitHubActionsView,
  DeferredProjectAuxiliaryPanel,
  DeferredProjectSettingsOverlay,
  DeferredSettingsOverlay,
} from "@/renderer/deferredFeatures";
import { BrowserRemoteConnectionGate } from "./BrowserRemoteConnectionGate";
import { navigateBackMobilePage } from "./mobilePageHistory";

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <PixelLoader size="lg" />
    </div>
  );
}

export function MobileTopLevelPage() {
  const page = usePanelStore((state) => state.mobileUtilityPage);
  const githubActionsContext = usePanelStore((state) => state.githubActionsContext);
  const projectSettingsId = usePanelStore((state) => state.projectSettingsId);

  if (page === "workspace") {
    return (
      <Suspense fallback={<PageLoader />}>
        <DeferredProjectAuxiliaryPanel
          includeTerminal={false}
          visible
          onClose={() => usePanelStore.getState().closeMobileUtilityPage()}
        />
      </Suspense>
    );
  }

  if (page === "projectSettings" && projectSettingsId) {
    return (
      <Suspense fallback={<PageLoader />}>
        <DeferredProjectSettingsOverlay
          projectId={projectSettingsId}
          onClose={() => usePanelStore.getState().closeProjectSettings()}
        />
      </Suspense>
    );
  }

  if (page === "settings") {
    return (
      <Suspense fallback={<PageLoader />}>
        <DeferredSettingsOverlay
          onClose={() => usePanelStore.getState().closeMobileUtilityPage()}
          onBack={() => {
            if (!navigateBackMobilePage()) {
              usePanelStore.getState().closeMobileUtilityPage();
            }
          }}
        />
      </Suspense>
    );
  }

  if (page === "githubActions" && githubActionsContext) {
    return (
      <BrowserRemoteConnectionGate
        allowOffline
        onPair={() => {
          const panelStore = usePanelStore.getState();
          panelStore.setGitHubActionsContext(null);
          panelStore.openSettingsSection("remoteServers");
        }}
      >
        <Suspense fallback={<PageLoader />}>
          <DeferredGitHubActionsView
            {...(githubActionsContext.projectId
              ? { projectId: githubActionsContext.projectId }
              : {})}
            {...(githubActionsContext.runId ? { runId: githubActionsContext.runId } : {})}
            onClose={() => usePanelStore.getState().setGitHubActionsContext(null)}
          />
        </Suspense>
      </BrowserRemoteConnectionGate>
    );
  }

  return null;
}
