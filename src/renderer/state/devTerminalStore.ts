import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDbStorage } from "./dbStorage";

export interface DevTerminalTab {
  id: string;
  projectId: string;
  worktreePath?: string;
  title: string;
  createdAt: string;
  /** When set, a second shell is shown side-by-side within this tab. */
  splitId?: string;
  splitTitle?: string;
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
  addTab: (projectId: string, projectName: string, worktreePath?: string) => DevTerminalTab;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  removeTabsForProject: (projectId: string) => string[];
  removeTabsForWorktree: (worktreePath: string) => string[];
  /** Create a split shell on the given tab. Returns the split shell ID. */
  splitTab: (tabId: string) => string;
  /** Remove the split shell from the given tab. Returns the removed split ID if any. */
  closeSplit: (tabId: string) => string | undefined;
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
      closePanel: () => set({ isOpen: false, activeProjectId: null }),
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

      addTab: (projectId, projectName, worktreePath?) => {
        const tab: DevTerminalTab = {
          id: `shell:${crypto.randomUUID()}`,
          projectId,
          ...(worktreePath ? { worktreePath } : {}),
          title: "",
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
          if (removed?.splitId) delete tabActivity[removed.splitId];
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
        const removedTabs = get().tabs.filter((t) => t.projectId === projectId);
        const removed = removedTabs.map((t) => t.id);
        if (removed.length === 0) return removed;

        // Also collect split shell IDs for cleanup
        const splitIds = removedTabs.filter((t) => t.splitId).map((t) => t.splitId!);

        set((state) => {
          const tabs = state.tabs.filter((t) => t.projectId !== projectId);
          let { activeTabId } = state;
          if (activeTabId && removed.includes(activeTabId)) {
            activeTabId = tabs.at(-1)?.id ?? null;
          }
          const tabActivity = { ...state.tabActivity };
          for (const id of removed) delete tabActivity[id];
          for (const id of splitIds) delete tabActivity[id];
          return { tabs, activeTabId, tabActivity };
        });
        return [...removed, ...splitIds];
      },

      removeTabsForWorktree: (worktreePath: string) => {
        const removedTabs = get().tabs.filter((t) => t.worktreePath === worktreePath);
        const removed = removedTabs.map((t) => t.id);
        if (removed.length === 0) return removed;

        const splitIds = removedTabs.filter((t) => t.splitId).map((t) => t.splitId!);

        set((state) => {
          const tabs = state.tabs.filter((t) => t.worktreePath !== worktreePath);
          let { activeTabId } = state;
          if (activeTabId && removed.includes(activeTabId)) {
            activeTabId = tabs.at(-1)?.id ?? null;
          }
          const tabActivity = { ...state.tabActivity };
          for (const id of removed) delete tabActivity[id];
          for (const id of splitIds) delete tabActivity[id];
          return { tabs, activeTabId, tabActivity };
        });
        return [...removed, ...splitIds];
      },

      splitTab: (tabId) => {
        const splitId = `shell:${crypto.randomUUID()}`;
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, splitId } : t)),
        }));
        return splitId;
      },

      closeSplit: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        const splitId = tab?.splitId;
        if (!splitId) return undefined;
        set((state) => {
          const tabs: DevTerminalTab[] = state.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const { splitId: _, ...rest } = t;
            return rest;
          });
          const tabActivity = { ...state.tabActivity };
          delete tabActivity[splitId];
          return { tabs, tabActivity };
        });
        return splitId;
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
          tabs: state.tabs.map((t) => {
            if (t.id === tabId) return { ...t, title };
            if (t.splitId === tabId) return { ...t, splitTitle: title };
            return t;
          }),
        }));
      },
    }),
    {
      name: "lightcode-dev-terminals",
      version: 1,
      storage: createDbStorage(),
      partialize: (state) => ({
        tabs: state.tabs,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);
