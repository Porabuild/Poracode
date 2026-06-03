import type { Project, ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";

// The home dir doesn't change at runtime, so cache the single IPC roundtrip
// and reuse it across callers (MainView mount effect + WelcomeOverlay
// "Ask Question" path).
let homeScopeLocationPromise: Promise<ProjectLocation> | null = null;

export function loadHomeScopeLocation(): Promise<ProjectLocation> {
  if (!homeScopeLocationPromise) {
    homeScopeLocationPromise = readBridge()
      .getHomeScopeLocation()
      .catch((err) => {
        homeScopeLocationPromise = null;
        throw err;
      });
  }
  return homeScopeLocationPromise;
}

export async function ensureHomeScopeProject(): Promise<Project> {
  const location = await loadHomeScopeLocation();
  return useAppStore.getState().ensureHomeProject(location);
}

export function setProjectDisabled(projectId: string, disabled: boolean): void {
  const store = useAppStore.getState();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return;
  if ((project.disabled ?? false) === disabled) return;

  const projectThreadIds = disabled
    ? store.threads.filter((t) => t.projectId === projectId).map((t) => t.id)
    : [];

  store.setProjectDisabled(projectId, disabled);

  if (disabled) {
    if (project.location.kind === "ssh" && projectThreadIds.length > 0) {
      void Promise.allSettled(
        projectThreadIds.map((threadId) => readBridge().closeThread({ threadId })),
      ).then(() => {
        const nextStore = useAppStore.getState();
        for (const threadId of projectThreadIds) {
          nextStore.markThreadExited(threadId);
        }
      });
    }

    void readBridge()
      .gitUnwatchProject({ projectId })
      .catch(() => undefined);

    useGitStore.getState().clearStatus(projectId);

    const termStore = useDevTerminalStore.getState();
    if (termStore.isOpen && termStore.activeProjectId === projectId) {
      termStore.closePanel();
    }

    const panelStore = usePanelStore.getState();
    if (panelStore.gitReviewContext?.projectId === projectId) {
      panelStore.setGitOverlayOpen(false);
      panelStore.setGitReviewContext(null);
    }
    if (panelStore.filesPanelContext?.projectId === projectId) {
      panelStore.setFilesPanelContext(null);
      useFileEditorStore.getState().clearSession();
    }
  }
}

export function deleteProject(projectId: string): void {
  const store = useAppStore.getState();
  const projectThreadIds = store.threads.filter((t) => t.projectId === projectId).map((t) => t.id);

  store.deleteProject(projectId);

  for (const threadId of projectThreadIds) {
    void readBridge()
      .closeThread({ threadId })
      .catch(() => undefined);
  }

  const termStore = useDevTerminalStore.getState();
  const removedTabIds = termStore.removeTabsForProject(projectId);
  for (const tabId of removedTabIds) {
    void readBridge()
      .closeThread({ threadId: tabId })
      .catch(() => undefined);
  }

  if (termStore.isOpen && termStore.activeProjectId === projectId) {
    termStore.closePanel();
  }

  useGitStore.getState().clearStatus(projectId);

  const panelStore = usePanelStore.getState();
  if (panelStore.gitReviewContext?.projectId === projectId) {
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewContext(null);
  }
  if (panelStore.filesPanelContext?.projectId === projectId) {
    panelStore.setFilesPanelContext(null);
    useFileEditorStore.getState().clearSession();
  }
}
