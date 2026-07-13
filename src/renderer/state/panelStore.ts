import { create } from "zustand";
import { persistStoreSlice, readPersistedSlice } from "@/renderer/utils/persistStoreSlice";
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
  /**
   * Explicit prData key override for selectors (title/url/checks). Set when
   * opening a PR for a branch that has no worktree, so the overlay reads the
   * branch-keyed prefetch entry instead of the main-branch key. Defaults to
   * `resolvePrKey(projectId, worktreePath)` when omitted.
   */
  prKey?: string;
}

export interface FilesPanelContext {
  projectId: string;
  projectName: string;
  worktreePath?: string;
  rootLabel: string;
}

export type RightPanelTab = "git" | "files" | "terminal" | "browser" | "usage" | "notes";

interface PanelState {
  gitReviewContext: GitReviewContext | null;
  gitReviewAsPanel: boolean;
  gitOverlayOpen: boolean;
  prReviewContext: PrReviewContext | null;
  filesPanelContext: FilesPanelContext | null;
  rightPanelTab: RightPanelTab;
  browserPanelOpen: boolean;
  usagePanelOpen: boolean;
  notesPanelOpen: boolean;
  browserOverlayOpen: boolean;
  browserOverlayMaximized: boolean;
  browserOverlayDrawerWidth: number;
  settingsOpen: boolean;
  /** When the overlay is opened deep-linked to a section (e.g. "usage"); else null. */
  settingsSection: string | null;
  projectSettingsId: string | null;
  threadSortMode: ThreadSortMode;
  threadSearchOpen: boolean;
  /** Whether the "Start from scratch" create-project modal is open. */
  createProjectModalOpen: boolean;
  /** Whether the "Clone a repository" modal is open. */
  cloneProjectModalOpen: boolean;
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
  setNotesPanelOpen: (v: boolean) => void;
  openNotesPanel: () => void;
  setBrowserOverlayOpen: (v: boolean) => void;
  setBrowserOverlayMaximized: (v: boolean) => void;
  setBrowserOverlayDrawerWidth: (v: number) => void;
  openBrowserPanel: () => void;
  openSettings: () => void;
  openSettingsSection: (section: string) => void;
  clearSettingsSection: () => void;
  closeSettings: () => void;
  openProjectSettings: (projectId: string) => void;
  closeProjectSettings: () => void;
  openThreadSearch: () => void;
  closeThreadSearch: () => void;
  openCreateProjectModal: () => void;
  closeCreateProjectModal: () => void;
  openCloneProjectModal: () => void;
  closeCloneProjectModal: () => void;
  closeAllPanels: () => void;
}

/**
 * Legacy hand-rolled storage keys, read once as the initial seed so existing
 * installs keep their state; the slice under PERSIST_KEY takes over on the first
 * write and wins on every launch where it exists.
 */
const LEGACY_GIT_CONTEXT_KEY = "poracode-git-panel-context";
const LEGACY_DRAWER_WIDTH_KEY = "poracode-browser-drawer-width";
const PERSIST_KEY = "poracode-panel";
const DEFAULT_DRAWER_WIDTH = 640;
const MIN_DRAWER_WIDTH = 420;
const MAX_DRAWER_WIDTH = 1400;

function loadInitialGitContext(): GitReviewContext | null {
  try {
    const raw = localStorage.getItem(LEGACY_GIT_CONTEXT_KEY);
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
    const raw = localStorage.getItem(LEGACY_DRAWER_WIDTH_KEY);
    if (raw === null) return DEFAULT_DRAWER_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return clampDrawerWidth(parsed);
  } catch {
    return DEFAULT_DRAWER_WIDTH;
  }
}

const initialPersisted = readPersistedSlice<{
  gitReviewContext: GitReviewContext | null;
  browserOverlayDrawerWidth: number;
}>(PERSIST_KEY);

export const usePanelStore = create<PanelState>()((set) => ({
  gitReviewContext: initialPersisted
    ? (initialPersisted.gitReviewContext ?? null)
    : loadInitialGitContext(),
  gitReviewAsPanel: false,
  gitOverlayOpen: false,
  prReviewContext: null,
  filesPanelContext: null,
  rightPanelTab: "git",
  browserPanelOpen: false,
  usagePanelOpen: false,
  notesPanelOpen: false,
  browserOverlayOpen: false,
  browserOverlayMaximized: false,
  browserOverlayDrawerWidth: clampDrawerWidth(
    initialPersisted?.browserOverlayDrawerWidth ?? loadInitialDrawerWidth(),
  ),
  settingsOpen: false,
  settingsSection: null,
  projectSettingsId: null,
  threadSortMode: "updated",
  threadSearchOpen: false,
  createProjectModalOpen: false,
  cloneProjectModalOpen: false,

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
          prev.prNumber === ctx.prNumber &&
          prev.prKey === ctx.prKey)
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
  // Toggling the docked right-panel browser is independent of the floating
  // overlay (drawer/fullscreen): hiding the panel must NOT tear down an active
  // overlay, otherwise maximizing the browser and then hiding the right panel
  // would make the fullscreen page vanish. Callers that genuinely want to
  // dismiss both (e.g. the last tab closing) close the overlay explicitly.
  setBrowserPanelOpen: (v) =>
    set((state) => (state.browserPanelOpen === v ? {} : { browserPanelOpen: v })),
  // NOTE: overlay state is intentionally independent of the right-panel
  // browser in both directions. Opening the overlay does NOT enable the
  // right-panel browser tab, and closing the overlay leaves the right panel in
  // whatever state the user had it. Maximized resets on close so the next open
  // lands in drawer mode.
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
  setNotesPanelOpen: (v) =>
    set((state) => (state.notesPanelOpen === v ? {} : { notesPanelOpen: v })),
  openNotesPanel: () =>
    set((state) =>
      state.notesPanelOpen && state.rightPanelTab === "notes"
        ? {}
        : { notesPanelOpen: true, rightPanelTab: "notes" as const },
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
  openProjectSettings: (projectId) =>
    set((state) => (state.projectSettingsId === projectId ? {} : { projectSettingsId: projectId })),
  closeProjectSettings: () =>
    set((state) => (state.projectSettingsId === null ? {} : { projectSettingsId: null })),
  openThreadSearch: () =>
    set((state) => (state.threadSearchOpen ? {} : { threadSearchOpen: true })),
  closeThreadSearch: () =>
    set((state) => (state.threadSearchOpen ? { threadSearchOpen: false } : {})),
  openCreateProjectModal: () =>
    set((state) => (state.createProjectModalOpen ? {} : { createProjectModalOpen: true })),
  closeCreateProjectModal: () =>
    set((state) => (state.createProjectModalOpen ? { createProjectModalOpen: false } : {})),
  openCloneProjectModal: () =>
    set((state) => (state.cloneProjectModalOpen ? {} : { cloneProjectModalOpen: true })),
  closeCloneProjectModal: () =>
    set((state) => (state.cloneProjectModalOpen ? { cloneProjectModalOpen: false } : {})),
  closeAllPanels: () => {
    set((state) => {
      // The floating browser overlay (drawer/fullscreen) is intentionally NOT
      // touched here: it is a standalone surface with its own close controls.
      // Closing the docked right panel — including the narrow-viewport auto-hide
      // that fires when the window shrinks — must not tear it down, otherwise a
      // maximized browser vanishes the moment the right panel auto-closes.
      if (
        state.gitReviewContext === null &&
        state.filesPanelContext === null &&
        !state.browserPanelOpen &&
        !state.usagePanelOpen &&
        !state.notesPanelOpen
      ) {
        return {};
      }
      return {
        gitReviewContext: null,
        filesPanelContext: null,
        browserPanelOpen: false,
        usagePanelOpen: false,
        notesPanelOpen: false,
      };
    });
  },
}));

// Only the two cross-launch slices persist; every other panel/overlay flag is
// session-scoped and resets on launch. Persisting just this slice keeps the
// frequent session-only toggles (right-panel tab, settings/search/modal open,
// sort mode, …) off localStorage — they change the store constantly but never
// the persisted value. Initial hydration is synchronous, seeded above from
// readPersistedSlice so the restored git panel and drawer width are present
// before first paint.
persistStoreSlice(usePanelStore, PERSIST_KEY, (state) => ({
  gitReviewContext: state.gitReviewContext,
  browserOverlayDrawerWidth: state.browserOverlayDrawerWidth,
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
