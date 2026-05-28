import { create } from "zustand";

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
  /** When set, the panel shows worktree tabs for this path; when null, project tabs. */
  activeWorktreePath: string | null;
  tabs: DevTerminalTab[];
  activeTabId: string | null;
  focusRequestId: number;
  /** Tab IDs with unseen output. Ephemeral — not persisted. */
  tabActivity: Record<string, true>;
  /**
   * Shell IDs (tab `id` or `splitId`) currently streaming output. Set on PTY
   * output, cleared after a short idle debounce. Ephemeral — not persisted.
   */
  streamingTabs: Record<string, true>;
}

interface DevTerminalActions {
  openPanel: (projectId: string) => void;
  openWorktreePanel: (projectId: string, worktreePath: string) => void;
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
  /** Note PTY output for a shell, flagging it as streaming until output idles. */
  noteShellOutput: (shellId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}

/** Idle window after the last PTY output before a shell is considered quiet. */
const STREAMING_IDLE_MS = 700;

/** Per-shell debounce timers backing `noteShellOutput`. Module-level so they
 * never trigger store re-renders and survive across `set` calls. */
const streamingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearStreaming(ids: string[]): void {
  for (const id of ids) {
    const timer = streamingTimers.get(id);
    if (timer) clearTimeout(timer);
    streamingTimers.delete(id);
  }
}

export const useDevTerminalStore = create<DevTerminalState & DevTerminalActions>()((set, get) => ({
  isOpen: false,
  activeProjectId: null,
  activeWorktreePath: null,
  tabs: [],
  activeTabId: null,
  focusRequestId: 0,
  tabActivity: {},
  streamingTabs: {},

  openPanel: (projectId) =>
    set((state) => ({
      isOpen: true,
      activeProjectId: projectId,
      activeWorktreePath: null,
      focusRequestId: state.focusRequestId + 1,
    })),
  openWorktreePanel: (projectId, worktreePath) =>
    set((state) => ({
      isOpen: true,
      activeProjectId: projectId,
      activeWorktreePath: worktreePath,
      focusRequestId: state.focusRequestId + 1,
    })),
  closePanel: () => set({ isOpen: false, activeProjectId: null, activeWorktreePath: null }),
  togglePanel: (projectId) =>
    set((state) => {
      if (state.isOpen && state.activeProjectId === projectId) {
        return { isOpen: false, activeWorktreePath: null };
      }
      return {
        isOpen: true,
        activeProjectId: projectId ?? state.activeProjectId,
        focusRequestId: state.focusRequestId + 1,
      };
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
      title: projectName,
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
        const projectTabs = removed ? tabs.filter((t) => t.projectId === removed.projectId) : tabs;
        activeTabId = projectTabs.at(-1)?.id ?? null;
      }
      const tabActivity = { ...state.tabActivity };
      delete tabActivity[tabId];
      if (removed?.splitId) delete tabActivity[removed.splitId];
      const streamingTabs = { ...state.streamingTabs };
      delete streamingTabs[tabId];
      if (removed?.splitId) delete streamingTabs[removed.splitId];
      clearStreaming(removed?.splitId ? [tabId, removed.splitId] : [tabId]);
      return { tabs, activeTabId, tabActivity, streamingTabs };
    }),

  setActiveTab: (tabId) => {
    const { focusRequestId, tabActivity } = get();
    if (tabActivity[tabId]) {
      const next = { ...tabActivity };
      delete next[tabId];
      return set({ activeTabId: tabId, focusRequestId: focusRequestId + 1, tabActivity: next });
    }
    set({ activeTabId: tabId, focusRequestId: focusRequestId + 1 });
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
      const streamingTabs = { ...state.streamingTabs };
      for (const id of removed) {
        delete tabActivity[id];
        delete streamingTabs[id];
      }
      for (const id of splitIds) {
        delete tabActivity[id];
        delete streamingTabs[id];
      }
      clearStreaming([...removed, ...splitIds]);
      return { tabs, activeTabId, tabActivity, streamingTabs };
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
      const streamingTabs = { ...state.streamingTabs };
      for (const id of removed) {
        delete tabActivity[id];
        delete streamingTabs[id];
      }
      for (const id of splitIds) {
        delete tabActivity[id];
        delete streamingTabs[id];
      }
      clearStreaming([...removed, ...splitIds]);
      return { tabs, activeTabId, tabActivity, streamingTabs };
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
      const streamingTabs = { ...state.streamingTabs };
      delete streamingTabs[splitId];
      clearStreaming([splitId]);
      return { tabs, tabActivity, streamingTabs };
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

  noteShellOutput: (shellId) => {
    const existing = streamingTimers.get(shellId);
    if (existing) clearTimeout(existing);
    streamingTimers.set(
      shellId,
      setTimeout(() => {
        streamingTimers.delete(shellId);
        const { streamingTabs } = get();
        if (!streamingTabs[shellId]) return;
        const next = { ...streamingTabs };
        delete next[shellId];
        set({ streamingTabs: next });
      }, STREAMING_IDLE_MS),
    );
    if (get().streamingTabs[shellId]) return;
    set((state) => ({ streamingTabs: { ...state.streamingTabs, [shellId]: true } }));
  },

  updateTabTitle: (tabId, rawTitle) => {
    // Shell titles are often full paths (e.g. "C:\Windows\System32\cmd.exe").
    // Extract the basename without extension for a cleaner tab label.
    const segment = rawTitle.split(/[/\\]/).pop() ?? rawTitle;
    const title = segment.replace(/\.[^.]+$/, "") || segment;
    // ConPTY reports "wsl" as the process title for wsl.exe — skip it
    // so the initial meaningful title (project/branch name) is preserved.
    if (title === "wsl") return;
    set((state) => {
      let changed = false;
      const tabs = state.tabs.map((t) => {
        if (t.id === tabId) {
          if (t.title === title) return t;
          changed = true;
          return { ...t, title };
        }
        if (t.splitId === tabId) {
          if (t.splitTitle === title) return t;
          changed = true;
          return { ...t, splitTitle: title };
        }
        return t;
      });
      return changed ? { tabs } : {};
    });
  },
}));
