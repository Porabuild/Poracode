import { Suspense, useEffect, useState } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  selectBrowserBridgeServer,
  selectBrowserBridgeDesktop,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
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
  const page = usePanelStore((state) => state.mobileUtilityPage);
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore(() => getCurrentProjectId());
  const browserExtracted = useBrowserPanelStore((state) => state.extracted);
  const projectServer = useRemoteServersStore(
    (state) => selectBrowserBridgeServer(state) ?? state.servers[0],
  );
  const servers = useRemoteServersStore((state) => state.servers);
  const [selectedDesktopId, setSelectedDesktopId] = useState<string | null>(null);
  const [selectedNotesProjectId, setSelectedNotesProjectId] = useState<string | null>(null);
  const selectedServer =
    servers.find((server) => server.desktopId === selectedDesktopId) ?? projectServer;
  const projectRuntime = useRemoteServersStore((state) =>
    selectedServer ? state.runtime[selectedServer.desktopId] : undefined,
  );
  const lastKnownProjects = useRemoteServersStore((state) =>
    selectedServer ? state.lastKnownProjects[selectedServer.desktopId] : undefined,
  );

  useEffect(() => {
    if (selectedDesktopId && !servers.some((server) => server.desktopId === selectedDesktopId)) {
      setSelectedDesktopId(null);
    }
  }, [selectedDesktopId, servers]);

  const changeDesktop = (desktopId: string | null) => {
    if (!desktopId) return;
    setSelectedDesktopId(desktopId);
    selectBrowserBridgeDesktop(desktopId);
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
      notesProjects.find((candidate) => candidate.remoteServerId === projectServer?.desktopId) ??
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

  if ((page === "pullRequests" || page === "schedules") && selectedServer) {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="m-utility-page min-h-0 flex-1 overflow-y-auto">
          <BrowserRemoteConnectionGate allowOffline>
            {page === "pullRequests" ? (
              <PullRequestsView
                key={selectedServer.desktopId}
                remoteDesktopId={selectedServer.desktopId}
                onRemoteDesktopChange={changeDesktop}
              />
            ) : (
              <SchedulesView
                key={selectedServer.desktopId}
                remoteDesktopId={selectedServer.desktopId}
                onRemoteDesktopChange={changeDesktop}
              />
            )}
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
          desktopId={selectedServer.desktopId}
          onDesktopChange={changeDesktop}
        />
      </div>
    );
  }

  return null;
}
