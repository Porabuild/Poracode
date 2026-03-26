import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface DevTerminalTab {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
}

interface DevTerminalState {
  isOpen: boolean;
  activeProjectId: string | null;
  tabs: DevTerminalTab[];
  activeTabId: string | null;
  /** Tab IDs with unseen output. Ephemeral — not persisted. */
  tabActivity: Record<string, true>;
}

interface DevTerminalActions {
  openPanel: (projectId: string) => void;
  closePanel: () => void;
  togglePanel: (projectId?: string) => void;
  setActiveProject: (projectId: string) => void;
  addTab: (projectId: string, projectName: string) => DevTerminalTab;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  removeTabsForProject: (projectId: string) => string[];
  markTabActive: (tabId: string) => void;
  clearTabActivity: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}

export const useDevTerminalStore = create<DevTerminalState & DevTerminalActions>()(
  persist(
    (set, get) => ({
      isOpen: false,
      activeProjectId: null,
      tabs: [],
      activeTabId: null,
      tabActivity: {},

      openPanel: (projectId) => set({ isOpen: true, activeProjectId: projectId }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: (projectId) =>
        set((state) => {
          if (state.isOpen && state.activeProjectId === projectId) {
            return { isOpen: false };
          }
          return { isOpen: true, activeProjectId: projectId ?? state.activeProjectId };
        }),

      setActiveProject: (projectId) => {
        const tabs = get().tabs.filter((t) => t.projectId === projectId);
        set({
          activeProjectId: projectId,
          activeTabId: tabs[0]?.id ?? null,
        });
      },

      addTab: (projectId, projectName) => {
        const existing = get().tabs.filter((t) => t.projectId === projectId);
        const suffix = existing.length > 0 ? ` (${existing.length + 1})` : "";
        const tab: DevTerminalTab = {
          id: `shell:${crypto.randomUUID()}`,
          projectId,
          title: `${projectName}${suffix}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tabs: [...state.tabs, tab] }));
        return tab;
      },

      removeTab: (tabId) =>
        set((state) => {
          const removed = state.tabs.find((t) => t.id === tabId);
          const tabs = state.tabs.filter((t) => t.id !== tabId);
          let { activeTabId } = state;
          if (activeTabId === tabId) {
            const projectTabs = removed
              ? tabs.filter((t) => t.projectId === removed.projectId)
              : tabs;
            activeTabId = projectTabs.at(-1)?.id ?? null;
          }
          const tabActivity = { ...state.tabActivity };
          delete tabActivity[tabId];
          return { tabs, activeTabId, tabActivity };
        }),

      setActiveTab: (tabId) => {
        const { tabActivity } = get();
        if (tabActivity[tabId]) {
          const next = { ...tabActivity };
          delete next[tabId];
          return set({ activeTabId: tabId, tabActivity: next });
        }
        set({ activeTabId: tabId });
      },

      removeTabsForProject: (projectId: string) => {
        const removed = get()
          .tabs.filter((t) => t.projectId === projectId)
          .map((t) => t.id);
        if (removed.length === 0) return removed;

        set((state) => {
          const tabs = state.tabs.filter((t) => t.projectId !== projectId);
          let { activeTabId } = state;
          if (activeTabId && removed.includes(activeTabId)) {
            activeTabId = tabs.at(-1)?.id ?? null;
          }
          const tabActivity = { ...state.tabActivity };
          for (const id of removed) delete tabActivity[id];
          return { tabs, activeTabId, tabActivity };
        });
        return removed;
      },

      markTabActive: (tabId) => {
        const { activeTabId, tabActivity } = get();
        if (tabId === activeTabId) return;
        if (tabActivity[tabId]) return;
        set({ tabActivity: { ...tabActivity, [tabId]: true } });
      },

      clearTabActivity: (tabId) => {
        const { tabActivity } = get();
        if (!tabActivity[tabId]) return;
        const next = { ...tabActivity };
        delete next[tabId];
        set({ tabActivity: next });
      },

      updateTabTitle: (tabId, rawTitle) => {
        // Shell titles are often full paths (e.g. "C:\Windows\System32\cmd.exe").
        // Extract the basename without extension for a cleaner tab label.
        const segment = rawTitle.split(/[/\\]/).pop() ?? rawTitle;
        const title = segment.replace(/\.[^.]+$/, "") || segment;
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
        }));
      },
    }),
    {
      name: "lightcode-dev-terminals",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);
