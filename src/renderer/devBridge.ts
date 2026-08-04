/**
 * DEV-only bridge for the interactive-testing skill (CDP smoke tests).
 *
 * Exposes the renderer's Zustand stores plus a few navigation/state helpers on
 * `window.__poracodeDev` so an external CDP driver can put the UI into any
 * state — app-update phases, settings sections, panels — WITHOUT clicking
 * through real flows or waiting on real async. Some states (a live download at a
 * specific byte count) are otherwise impossible to trigger on demand.
 *
 * The whole thing is guarded by `import.meta.env.DEV`, so it is dead-code
 * eliminated from production bundles. See `.agents/skills/interactive-testing`.
 */
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useUpdateStore } from "@/renderer/state/updateStore";

type UpdateStoreState = ReturnType<typeof useUpdateStore.getState>;

export function installDevBridge(): void {
  if (!import.meta.env.DEV) return;

  const target = globalThis as unknown as { __poracodeDev?: unknown };
  if (target.__poracodeDev) return;

  target.__poracodeDev = {
    /** Raw Zustand stores — call `.getState()` / `.setState()` to inspect or drive any state. */
    stores: {
      update: useUpdateStore,
      app: useAppStore,
      agentStatuses: useAgentStatusesStore,
      panel: usePanelStore,
      sidebarUi: useSidebarUiStore,
      sharedSettings: useSharedSettings,
    },
    /** Open Settings; pass a section id (e.g. "about", "usage", "appearance") to deep-link. */
    openSettings: (section?: string) => {
      const panel = usePanelStore.getState();
      if (section) panel.openSettingsSection(section);
      else panel.openSettings();
    },
    /** Close the Settings overlay (back to the app surface). */
    closeSettings: () => usePanelStore.setState({ settingsOpen: false }),
    /** Patch the app-update store (phase / version / download progress) for screenshots. */
    setUpdate: (patch: Partial<UpdateStoreState>) => useUpdateStore.setState(patch),
    /** Reset transient driven state to a clean baseline — call before teardown. */
    reset: () => {
      const app = useAppStore.getState();
      useAppStore.setState({
        draftContents: {},
        threadDraftContents: {},
        pendingDraftWorktreeSelections: {},
        pendingComposerSeeds: {},
        draftContentDiscardRequests: {
          ...app.draftContentDiscardRequests,
          ...Object.fromEntries(
            Object.keys(app.draftContents).map((projectId) => [projectId, true] as const),
          ),
        },
      });
      usePanelStore.setState({
        gitReviewContext: null,
        filesPanelContext: null,
        subAgentPanelOpen: false,
        browserPanelOpen: false,
        usagePanelOpen: false,
        notesPanelOpen: false,
        settingsOpen: false,
        projectSettingsId: null,
        threadSearchOpen: false,
        createProjectModalOpen: false,
        cloneProjectModalOpen: false,
        gitOverlayOpen: false,
        prReviewContext: null,
        githubActionsContext: null,
        subAgentPanelContext: null,
        browserOverlayOpen: false,
        browserOverlayMaximized: false,
      });
      useUpdateStore.setState({
        phase: "idle",
        version: null,
        downloadPercent: 0,
        downloadTransferred: null,
        downloadTotal: null,
      });
    },
  };
}
