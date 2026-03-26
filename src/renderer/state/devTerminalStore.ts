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
}

export const useDevTerminalStore = create<DevTerminalState & DevTerminalActions>()(
  persist(
    (set, get) => ({
      isOpen: false,
      activeProjectId: null,
      tabs: [],
      activeTabId: null,

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
            // Pick next tab from the same project.
            const projectTabs = removed
              ? tabs.filter((t) => t.projectId === removed.projectId)
              : tabs;
            activeTabId = projectTabs.at(-1)?.id ?? null;
          }
          return { tabs, activeTabId };
        }),

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

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
          return { tabs, activeTabId };
        });
        return removed;
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
