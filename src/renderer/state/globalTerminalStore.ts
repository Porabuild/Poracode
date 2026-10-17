import { create } from "zustand";
import { readBridge } from "@/renderer/bridge";
import type { TerminalTab } from "@/renderer/state/devTerminalStore";
import {
  closeThreads,
  startDeferredPanelShell,
  wasShellStartedDeferred,
} from "@/renderer/utils/shellUtils";
import { forgetShellLaunch } from "@/renderer/utils/shellStartRegistry";
import type { ProjectLocation, TerminalSize } from "@/shared/contracts";

interface GlobalTerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  location: ProjectLocation | null;
  open: () => void;
  addTab: () => TerminalTab;
  setActiveTab: (tabId: string) => void;
  cycleTab: (direction: "next" | "previous") => void;
  updateTabTitle: (tabId: string, title: string) => void;
  removeTab: (tabId: string) => void;
  ensureStarted: (shellId: string, size: TerminalSize) => Promise<void>;
}

export const useGlobalTerminalStore = create<GlobalTerminalState>((set, get) => {
  const starting = new Map<string, Promise<void>>();
  let loadingHome: Promise<ProjectLocation> | null = null;

  return {
    tabs: [],
    activeTabId: null,
    location: null,
    open: () => {
      if (get().tabs.length === 0) get().addTab();
    },
    addTab: () => {
      const tab: TerminalTab = {
        id: `shell:${crypto.randomUUID()}`,
        title: "~",
        createdAt: new Date().toISOString(),
      };
      set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
      return tab;
    },
    setActiveTab: (tabId) => {
      if (get().tabs.some((tab) => tab.id === tabId)) set({ activeTabId: tabId });
    },
    cycleTab: (direction) => {
      const { tabs, activeTabId } = get();
      if (tabs.length < 2) return;
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      const base = currentIndex === -1 ? tabs.length - 1 : currentIndex;
      const delta = direction === "next" ? 1 : -1;
      const next = tabs[(base + delta + tabs.length) % tabs.length];
      if (next) set({ activeTabId: next.id });
    },
    updateTabTitle: (tabId, rawTitle) => {
      const segment = rawTitle.split(/[/\\]/).pop() ?? rawTitle;
      const title = segment.replace(/\.[^.]+$/, "") || segment;
      if (title === "wsl" || !get().tabs.some((tab) => tab.id === tabId && tab.title !== title))
        return;
      set((state) => ({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, title } : tab)),
      }));
    },
    removeTab: (tabId) => {
      if (!get().tabs.some((tab) => tab.id === tabId)) return;
      forgetShellLaunch(tabId);
      set((state) => {
        const tabs = state.tabs.filter((tab) => tab.id !== tabId);
        return {
          tabs,
          activeTabId: state.activeTabId === tabId ? (tabs.at(-1)?.id ?? null) : state.activeTabId,
        };
      });
      const pending = starting.get(tabId);
      if (pending) {
        // The supervisor may still be creating the PTY; close only after that attempt settles.
        void pending.catch(() => undefined).then(() => closeThreads([tabId]));
      } else {
        void closeThreads([tabId]);
      }
    },
    ensureStarted: (shellId, size) => {
      if (!get().tabs.some((tab) => tab.id === shellId)) return Promise.resolve();
      const pending = starting.get(shellId);
      if (pending) return pending;
      if (wasShellStartedDeferred(shellId)) return Promise.resolve();

      const started = (async () => {
        let location = get().location;
        if (!location) {
          loadingHome ??= readBridge()
            .getHomeScopeLocation()
            .then((homeLocation) => {
              set({ location: homeLocation });
              return homeLocation;
            })
            .finally(() => {
              loadingHome = null;
            });
          location = await loadingHome;
        }
        if (!get().tabs.some((tab) => tab.id === shellId)) return;
        await startDeferredPanelShell({
          shellId,
          projectLocation: location,
          startInHome: true,
          initialSize: size,
        });
      })().finally(() => {
        starting.delete(shellId);
      });
      starting.set(shellId, started);
      return started;
    },
  };
});
