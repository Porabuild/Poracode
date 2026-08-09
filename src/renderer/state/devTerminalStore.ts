import { create } from "zustand";

export interface DevTerminalTab {
  id: string;
  projectId: string;
  worktreePath?: string;
  /** Project action whose process owns this tab, when launched from the Run menu. */
  runActionId?: string;
  title: string;
  createdAt: string;
  /** When set, a second shell is shown side-by-side within this tab. */
  splitId?: string;
  splitTitle?: string;
}

interface DevTerminalState {
  isOpen: boolean;
  /**
   * True while the panel was opened by an explicit user action (icon click,
   * auto-show) and the follow-the-thread lock has not re-scoped it since. The
   * bottom-panel visibility gate uses it so an explicit open shows immediately
   * even when the terminal's scope does not match the focused thread's scope.
   * Cleared on close and whenever the lock re-scopes via `setPanelScope`.
   * Ephemeral — never persisted.
   */
  explicitlyOpened: boolean;
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
  /** Run-action commands currently executing. Ephemeral — not persisted. */
  runningTabs: Record<string, true>;
}

interface DevTerminalActions {
  openPanel: (projectId: string) => void;
  openWorktreePanel: (projectId: string, worktreePath: string) => void;
  closePanel: () => void;
  setActiveProject: (projectId: string) => void;
  /** Re-scope an open panel without opening it or spawning a shell. */
  setPanelScope: (projectId: string, worktreePath?: string) => void;
  addTab: (
    projectId: string,
    projectName: string,
    worktreePath?: string,
    runActionId?: string,
  ) => DevTerminalTab;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  /**
   * Switch to the adjacent tab within the visible strip (active project +
   * worktree scope), wrapping at the ends. No-op with fewer than two tabs.
   * Mirrors DevTerminalPanel's `projectTabs` filter so it cycles exactly the
   * tabs the user sees.
   */
  cycleTab: (direction: "next" | "previous") => void;
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
  markShellRunning: (shellId: string) => void;
  markShellExited: (shellId: string) => void;
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
  explicitlyOpened: false,
  activeProjectId: null,
  activeWorktreePath: null,
  tabs: [],
  activeTabId: null,
  focusRequestId: 0,
  tabActivity: {},
  streamingTabs: {},
  runningTabs: {},

  openPanel: (projectId) =>
    set((state) => ({
      isOpen: true,
      explicitlyOpened: true,
      activeProjectId: projectId,
      activeWorktreePath: null,
      focusRequestId: state.focusRequestId + 1,
    })),
  openWorktreePanel: (projectId, worktreePath) =>
    set((state) => ({
      isOpen: true,
      explicitlyOpened: true,
      activeProjectId: projectId,
      activeWorktreePath: worktreePath,
      focusRequestId: state.focusRequestId + 1,
    })),
  closePanel: () =>
    set({
      isOpen: false,
      explicitlyOpened: false,
      activeProjectId: null,
      activeWorktreePath: null,
    }),

  setActiveProject: (projectId) => {
    const tabs = get().tabs.filter((t) => t.projectId === projectId);
    set({
      activeProjectId: projectId,
      activeTabId: tabs[0]?.id ?? null,
    });
  },

  setPanelScope: (projectId, worktreePath) =>
    set((state) => {
      // The follow lock re-scoping the panel takes over from any explicit
      // open, so the visibility gate falls back to scope matching.
      const sameScope =
        state.activeProjectId === projectId &&
        (state.activeWorktreePath ?? undefined) === worktreePath;
      if (sameScope && !state.explicitlyOpened) {
        return {};
      }
      const scopedTab = state.tabs.find(
        (tab) => tab.projectId === projectId && (tab.worktreePath ?? undefined) === worktreePath,
      );
      return {
        explicitlyOpened: false,
        activeProjectId: projectId,
        activeWorktreePath: worktreePath ?? null,
        ...(sameScope ? {} : { activeTabId: scopedTab?.id ?? null }),
      };
    }),

  addTab: (projectId, projectName, worktreePath?, runActionId?) => {
    const tab: DevTerminalTab = {
      id: `shell:${crypto.randomUUID()}`,
      projectId,
      ...(worktreePath ? { worktreePath } : {}),
      ...(runActionId ? { runActionId } : {}),
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
      const runningTabs = { ...state.runningTabs };
      delete runningTabs[tabId];
      if (removed?.splitId) delete runningTabs[removed.splitId];
      clearStreaming(removed?.splitId ? [tabId, removed.splitId] : [tabId]);
      return { tabs, activeTabId, tabActivity, streamingTabs, runningTabs };
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

  cycleTab: (direction) => {
    const state = get();
    // The same predicate DevTerminalPanel uses to render its visible tab strip.
    const visible = state.tabs.filter((tab) => {
      if (tab.projectId !== state.activeProjectId) return false;
      if (state.activeWorktreePath) return tab.worktreePath === state.activeWorktreePath;
      return !tab.worktreePath;
    });
    if (visible.length < 2) return;
    // Fall back to the last tab when none is active — matches the panel's
    // `selectedTabId` default (projectTabs.at(-1)).
    const currentIndex = visible.findIndex((tab) => tab.id === state.activeTabId);
    const base = currentIndex === -1 ? visible.length - 1 : currentIndex;
    const delta = direction === "next" ? 1 : -1;
    const next = visible[(base + delta + visible.length) % visible.length];
    if (next && next.id !== state.activeTabId) state.setActiveTab(next.id);
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
      const runningTabs = { ...state.runningTabs };
      for (const id of removed) {
        delete tabActivity[id];
        delete streamingTabs[id];
        delete runningTabs[id];
      }
      for (const id of splitIds) {
        delete tabActivity[id];
        delete streamingTabs[id];
        delete runningTabs[id];
      }
      clearStreaming([...removed, ...splitIds]);
      return { tabs, activeTabId, tabActivity, streamingTabs, runningTabs };
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
      const runningTabs = { ...state.runningTabs };
      for (const id of removed) {
        delete tabActivity[id];
        delete streamingTabs[id];
        delete runningTabs[id];
      }
      for (const id of splitIds) {
        delete tabActivity[id];
        delete streamingTabs[id];
        delete runningTabs[id];
      }
      clearStreaming([...removed, ...splitIds]);
      return { tabs, activeTabId, tabActivity, streamingTabs, runningTabs };
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
      const runningTabs = { ...state.runningTabs };
      delete runningTabs[splitId];
      clearStreaming([splitId]);
      return { tabs, tabActivity, streamingTabs, runningTabs };
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

  markShellRunning: (shellId) =>
    set((state) =>
      state.runningTabs[shellId] ? {} : { runningTabs: { ...state.runningTabs, [shellId]: true } },
    ),

  markShellExited: (shellId) =>
    set((state) => {
      if (!state.runningTabs[shellId]) return {};
      const runningTabs = { ...state.runningTabs };
      delete runningTabs[shellId];
      return { runningTabs };
    }),

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

export function resetDevTerminalStore(): void {
  clearStreaming([...streamingTimers.keys()]);
  useDevTerminalStore.setState({
    isOpen: false,
    explicitlyOpened: false,
    activeProjectId: null,
    activeWorktreePath: null,
    tabs: [],
    activeTabId: null,
    focusRequestId: 0,
    tabActivity: {},
    streamingTabs: {},
    runningTabs: {},
  });
}
