import { create } from "zustand";
import type { ThreadSortMode } from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { useFileEditorStore } from "./fileEditorStore";

export interface GitReviewContext {
  projectId: string;
  worktreePath?: string;
}

export interface PrReviewContext {
  projectId: string;
  worktreePath?: string;
  prNumber: number;
}

export interface FilesPanelContext {
  projectId: string;
  projectName: string;
  worktreePath?: string;
  rootLabel: string;
}

export type RightPanelTab = "git" | "files" | "terminal" | "browser" | "usage";
export type ProjectSettingsSectionId = "general" | "worktrees" | "actions" | "search" | "agents";

interface PanelState {
  gitReviewContext: GitReviewContext | null;
  gitReviewAsPanel: boolean;
  gitOverlayOpen: boolean;
  prReviewContext: PrReviewContext | null;
  filesPanelContext: FilesPanelContext | null;
  rightPanelTab: RightPanelTab;
  browserPanelOpen: boolean;
  usagePanelOpen: boolean;
  browserOverlayOpen: boolean;
  browserOverlayMaximized: boolean;
  browserOverlayDrawerWidth: number;
  settingsOpen: boolean;
  /** When the overlay is opened deep-linked to a section (e.g. "usage"); else null. */
  settingsSection: string | null;
  projectSettingsId: string | null;
  projectSettingsInitialSection: ProjectSettingsSectionId | null;
  threadSortMode: ThreadSortMode;
  threadSearchOpen: boolean;
  setGitReviewContext: (ctx: GitReviewContext | null) => void;
  setThreadSortMode: (mode: ThreadSortMode) => void;
  setGitReviewAsPanel: (v: boolean) => void;
  setGitOverlayOpen: (v: boolean) => void;
  setPrReviewContext: (ctx: PrReviewContext | null) => void;
  setFilesPanelContext: (ctx: FilesPanelContext | null) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setBrowserPanelOpen: (v: boolean) => void;
  setUsagePanelOpen: (v: boolean) => void;
  openUsagePanel: () => void;
  setBrowserOverlayOpen: (v: boolean) => void;
  setBrowserOverlayMaximized: (v: boolean) => void;
  setBrowserOverlayDrawerWidth: (v: number) => void;
  openBrowserPanel: () => void;
  openSettings: () => void;
  openSettingsSection: (section: string) => void;
  clearSettingsSection: () => void;
  closeSettings: () => void;
  openProjectSettings: (projectId: string, initialSection?: ProjectSettingsSectionId) => void;
  closeProjectSettings: () => void;
  openThreadSearch: () => void;
  closeThreadSearch: () => void;
  closeAllPanels: () => void;
}

const STORAGE_KEY = "lightcode-git-panel-context";
const DRAWER_WIDTH_STORAGE_KEY = "lightcode-browser-drawer-width";
const DEFAULT_DRAWER_WIDTH = 640;
const MIN_DRAWER_WIDTH = 420;
const MAX_DRAWER_WIDTH = 1400;

function loadInitialGitContext(): GitReviewContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clampDrawerWidth(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_DRAWER_WIDTH;
  return Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, Math.round(v)));
}

function loadInitialDrawerWidth(): number {
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY);
    if (raw === null) return DEFAULT_DRAWER_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return clampDrawerWidth(parsed);
  } catch {
    return DEFAULT_DRAWER_WIDTH;
  }
}

export const usePanelStore = create<PanelState>((set) => ({
  gitReviewContext: loadInitialGitContext(),
  gitReviewAsPanel: false,
  gitOverlayOpen: false,
  prReviewContext: null,
  filesPanelContext: null,
  rightPanelTab: "git",
  browserPanelOpen: false,
  usagePanelOpen: false,
  browserOverlayOpen: false,
  browserOverlayMaximized: false,
  browserOverlayDrawerWidth: loadInitialDrawerWidth(),
  settingsOpen: false,
  settingsSection: null,
  projectSettingsId: null,
  projectSettingsInitialSection: null,
  threadSortMode: "updated",
  threadSearchOpen: false,

  setGitReviewContext: (ctx) => {
    const prev = usePanelStore.getState().gitReviewContext;
    if (
      (prev === null && ctx === null) ||
      (prev !== null &&
        ctx !== null &&
        prev.projectId === ctx.projectId &&
        prev.worktreePath === ctx.worktreePath)
    ) {
      return;
    }
    if (ctx) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ gitReviewContext: ctx });
  },
  setGitReviewAsPanel: (v) =>
    set((state) => (state.gitReviewAsPanel === v ? {} : { gitReviewAsPanel: v })),
  setGitOverlayOpen: (v) =>
    set((state) => (state.gitOverlayOpen === v ? {} : { gitOverlayOpen: v })),
  setPrReviewContext: (ctx) =>
    set((state) => {
      const prev = state.prReviewContext;
      if (
        (prev === null && ctx === null) ||
        (prev !== null &&
          ctx !== null &&
          prev.projectId === ctx.projectId &&
          prev.worktreePath === ctx.worktreePath &&
          prev.prNumber === ctx.prNumber)
      ) {
        return {};
      }
      return { prReviewContext: ctx };
    }),
  setFilesPanelContext: (ctx) =>
    set((state) => {
      const prev = state.filesPanelContext;
      if (
        (prev === null && ctx === null) ||
        (prev !== null &&
          ctx !== null &&
          prev.projectId === ctx.projectId &&
          prev.projectName === ctx.projectName &&
          prev.worktreePath === ctx.worktreePath &&
          prev.rootLabel === ctx.rootLabel)
      ) {
        return {};
      }
      return { filesPanelContext: ctx };
    }),
  setRightPanelTab: (tab) =>
    set((state) => (state.rightPanelTab === tab ? {} : { rightPanelTab: tab })),
  setBrowserPanelOpen: (v) =>
    set((state) =>
      state.browserPanelOpen === v && (v || !state.browserOverlayOpen)
        ? {}
        : {
            browserPanelOpen: v,
            ...(v ? {} : { browserOverlayOpen: false, browserOverlayMaximized: false }),
          },
    ),
  // NOTE: overlay state is intentionally independent of the right-panel
  // browser. Opening the overlay does NOT enable the right-panel browser tab,
  // and closing the overlay leaves the right panel in whatever state the user
  // had it. Maximized resets on close so the next open lands in drawer mode.
  setBrowserOverlayOpen: (v) =>
    set((state) =>
      state.browserOverlayOpen === v
        ? {}
        : {
            browserOverlayOpen: v,
            ...(v ? {} : { browserOverlayMaximized: false }),
          },
    ),
  setBrowserOverlayMaximized: (v) =>
    set((state) => (state.browserOverlayMaximized === v ? {} : { browserOverlayMaximized: v })),
  setBrowserOverlayDrawerWidth: (v) =>
    set((state) => {
      const clamped = clampDrawerWidth(v);
      if (state.browserOverlayDrawerWidth === clamped) return {};
      try {
        localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(clamped));
      } catch {
        // localStorage may be unavailable (private mode, sandbox); fall back to in-memory.
      }
      return { browserOverlayDrawerWidth: clamped };
    }),
  openBrowserPanel: () =>
    set((state) =>
      state.browserPanelOpen && state.rightPanelTab === "browser"
        ? {}
        : { browserPanelOpen: true, rightPanelTab: "browser" as const },
    ),
  setUsagePanelOpen: (v) =>
    set((state) => (state.usagePanelOpen === v ? {} : { usagePanelOpen: v })),
  openUsagePanel: () =>
    set((state) =>
      state.usagePanelOpen && state.rightPanelTab === "usage"
        ? {}
        : { usagePanelOpen: true, rightPanelTab: "usage" as const },
    ),
  setThreadSortMode: (mode) =>
    set((state) => (state.threadSortMode === mode ? {} : { threadSortMode: mode })),
  openSettings: () =>
    set((state) =>
      state.settingsOpen && state.settingsSection === null
        ? {}
        : { settingsOpen: true, settingsSection: null },
    ),
  openSettingsSection: (section) => set({ settingsOpen: true, settingsSection: section }),
  clearSettingsSection: () =>
    set((state) => (state.settingsSection === null ? {} : { settingsSection: null })),
  closeSettings: () => set((state) => (state.settingsOpen ? { settingsOpen: false } : {})),
  openProjectSettings: (projectId, initialSection) =>
    set((state) =>
      state.projectSettingsId === projectId &&
      state.projectSettingsInitialSection === (initialSection ?? null)
        ? {}
        : { projectSettingsId: projectId, projectSettingsInitialSection: initialSection ?? null },
    ),
  closeProjectSettings: () =>
    set((state) =>
      state.projectSettingsId === null && state.projectSettingsInitialSection === null
        ? {}
        : { projectSettingsId: null, projectSettingsInitialSection: null },
    ),
  openThreadSearch: () =>
    set((state) => (state.threadSearchOpen ? {} : { threadSearchOpen: true })),
  closeThreadSearch: () =>
    set((state) => (state.threadSearchOpen ? { threadSearchOpen: false } : {})),
  closeAllPanels: () => {
    localStorage.removeItem(STORAGE_KEY);
    set((state) => {
      if (
        state.gitReviewContext === null &&
        state.filesPanelContext === null &&
        !state.browserPanelOpen &&
        !state.usagePanelOpen &&
        !state.browserOverlayOpen &&
        !state.browserOverlayMaximized
      ) {
        return {};
      }
      return {
        gitReviewContext: null,
        filesPanelContext: null,
        browserPanelOpen: false,
        usagePanelOpen: false,
        browserOverlayOpen: false,
        browserOverlayMaximized: false,
      };
    });
  },
}));

// Returns true when any full-window overlay (z-50) is currently rendered above
// the right panel (z-10). Used by the browser sync layer to force the in-app
// browser into overlay mode (z-80) when a link is opened from within one of
// those overlays — otherwise the navigated page would render in the right
// panel, hidden behind the active overlay. Add new obstructing overlays here.
export function selectAnyObstructingOverlayOpen(): boolean {
  const p = usePanelStore.getState();
  if (
    p.settingsOpen ||
    p.projectSettingsId !== null ||
    p.gitOverlayOpen ||
    p.prReviewContext !== null ||
    p.threadSearchOpen
  ) {
    return true;
  }
  return useFileEditorStore.getState().overlayMode === "fullscreen";
}

// Narrow selectors — primitive returns, stable under Object.is.
export function useGitReviewProjectId(): string | undefined {
  return usePanelStore((s) => s.gitReviewContext?.projectId);
}
export function useGitReviewWorktreePath(): string | undefined {
  return usePanelStore((s) => s.gitReviewContext?.worktreePath);
}
export function useIsGitReviewPanel(): boolean {
  return usePanelStore((s) => s.gitReviewAsPanel);
}
export function useIsGitOverlayOpen(): boolean {
  return usePanelStore((s) => s.gitOverlayOpen);
}
export function useFilesPanelProjectId(): string | undefined {
  return usePanelStore((s) => s.filesPanelContext?.projectId);
}
export function useFilesPanelWorktreePath(): string | undefined {
  return usePanelStore((s) => s.filesPanelContext?.worktreePath);
}
export function useRightPanelTab(): RightPanelTab {
  return usePanelStore((s) => s.rightPanelTab);
}
