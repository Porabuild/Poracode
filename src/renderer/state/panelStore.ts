import { create } from "zustand";
import type { ProjectLocation } from "@/shared/contracts";
import { persistStoreSlice, readPersistedSlice } from "@/renderer/utils/persistStoreSlice";
import type {
  ThreadListLayout,
  ThreadSortMode,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { useFileEditorStore } from "./fileEditorStore";

export interface GitReviewContext {
  projectId: string;
  worktreePath?: string;
  originComposerId?: string;
}

export interface PrReviewContext {
  projectId: string;
  worktreePath?: string;
  prNumber: number;
  /** Skip pulling locally for PR contexts that are not tied to a verified local checkout. */
  skipLocalSync?: boolean;
  /**
   * Explicit prData key override for selectors (title/url/checks). Set when
   * opening a PR for a branch that has no worktree, so the overlay reads the
   * branch-keyed prefetch entry instead of the main-branch key. Defaults to
   * `resolvePrKey(projectId, worktreePath)` when omitted.
   */
  prKey?: string;
}

export interface GitHubActionsContext {
  projectId?: string;
  runId?: number;
}

export interface FilesPanelContext {
  projectId: string;
  projectName: string;
  worktreePath?: string;
  rootLabel: string;
}

export interface SubAgentPanelContext {
  threadId: string;
  parentItemId: string;
  projectLocation?: ProjectLocation;
}

export type RightPanelTab =
  | "git"
  | "files"
  | "terminal"
  | "browser"
  | "usage"
  | "notes"
  | "ports"
  | "plan"
  | "subagent";

/** Tabs that can be dragged into a dock zone. Thread-transient tabs (plan, subagent) and ports stay fixed. */
export const DOCKABLE_PANEL_TABS: ReadonlySet<RightPanelTab> = new Set([
  "git",
  "files",
  "terminal",
  "browser",
  "usage",
  "notes",
]);

/** A second panel section stacked above or below the active right-panel tab. */
export interface RightPanelSplit {
  tab: RightPanelTab;
  /** Which half of the right panel the split tab occupies. */
  placement: "top" | "bottom";
}

export type BottomDockPlacement = "left" | "right";

/**
 * Panels docked in the bottom row, one per side. The terminal (when open) sits
 * between them, so the row reads `left | terminal | right`; with the terminal
 * closed the docks own the row on their own.
 */
export interface BottomPanelDocks {
  left: RightPanelTab | null;
  right: RightPanelTab | null;
}

export const EMPTY_BOTTOM_PANEL_DOCKS: BottomPanelDocks = { left: null, right: null };

export type PanelDockZone = "right-panel" | "bottom-panel";

/** Resolved drop location for a dragged panel-tab icon. */
export type PanelDockTarget =
  | { zone: "right-panel"; placement: "top" | "bottom" }
  | { zone: "bottom-panel"; placement: BottomDockPlacement };

interface PanelState {
  gitReviewContext: GitReviewContext | null;
  gitReviewAsPanel: boolean;
  gitOverlayOpen: boolean;
  prReviewContext: PrReviewContext | null;
  githubActionsContext: GitHubActionsContext | null;
  filesPanelContext: FilesPanelContext | null;
  subAgentPanelContext: SubAgentPanelContext | null;
  subAgentPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  /**
   * Session-scoped like `rightPanelTab`: a second tab rendered stacked with the
   * active one in the right panel, or null when the panel is unsplit.
   */
  rightPanelSplit: RightPanelSplit | null;
  /** Panels rendered in the bottom row. Only meaningful with terminalPosition "bottom". */
  bottomPanelDocks: BottomPanelDocks;
  /**
   * When true, the open right-panel tools re-scope to whichever thread is
   * focused instead of staying on the project/worktree they were opened from.
   * Persisted — single-thread users leave it on permanently.
   */
  rightPanelFollowsThread: boolean;
  /** Vertical offset (px from the pane's top) of the per-thread tool rail. */
  threadToolRailOffset: number;
  browserPanelOpen: boolean;
  usagePanelOpen: boolean;
  notesPanelOpen: boolean;
  portsPanelOpen: boolean;
  browserOverlayOpen: boolean;
  browserOverlayMaximized: boolean;
  browserOverlayDrawerWidth: number;
  settingsOpen: boolean;
  /** When the overlay is opened deep-linked to a section (e.g. "usage"); else null. */
  settingsSection: string | null;
  projectSettingsId: string | null;
  threadSortMode: ThreadSortMode;
  threadListLayout: ThreadListLayout;
  threadSearchOpen: boolean;
  /** Whether the "Start from scratch" create-project modal is open. */
  createProjectModalOpen: boolean;
  /** Whether the "Clone a repository" modal is open. */
  cloneProjectModalOpen: boolean;
  setGitReviewContext: (ctx: GitReviewContext | null) => void;
  setThreadSortMode: (mode: ThreadSortMode) => void;
  setThreadListLayout: (layout: ThreadListLayout) => void;
  setGitReviewAsPanel: (v: boolean) => void;
  setGitOverlayOpen: (v: boolean) => void;
  setPrReviewContext: (ctx: PrReviewContext | null) => void;
  setGitHubActionsContext: (ctx: GitHubActionsContext | null) => void;
  setFilesPanelContext: (ctx: FilesPanelContext | null) => void;
  setSubAgentPanelContext: (ctx: SubAgentPanelContext | null) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setRightPanelSplit: (split: RightPanelSplit | null) => void;
  /** Put a tab in one bottom slot (or clear it); a tab never occupies two slots. */
  setBottomPanelDock: (placement: BottomDockPlacement, tab: RightPanelTab | null) => void;
  /** Remove a tab from whichever bottom slot holds it. */
  clearBottomPanelDockTab: (tab: RightPanelTab) => void;
  clearBottomPanelDocks: () => void;
  toggleRightPanelFollowsThread: () => void;
  setThreadToolRailOffset: (offset: number) => void;
  setBrowserPanelOpen: (v: boolean) => void;
  setUsagePanelOpen: (v: boolean) => void;
  openUsagePanel: () => void;
  setNotesPanelOpen: (v: boolean) => void;
  openNotesPanel: () => void;
  setPortsPanelOpen: (v: boolean) => void;
  openPortsPanel: () => void;
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

function projectLocationsEqual(
  a: ProjectLocation | undefined,
  b: ProjectLocation | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "wsl" && b.kind === "wsl") {
    return a.distro === b.distro && a.linuxPath === b.linuxPath && a.uncPath === b.uncPath;
  }
  return a.kind !== "wsl" && b.kind !== "wsl" && a.path === b.path;
}

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
  rightPanelFollowsThread?: boolean;
  threadToolRailOffset?: number;
  threadSortMode?: ThreadSortMode;
  threadListLayout?: ThreadListLayout;
}>(PERSIST_KEY);

// Kept in sync with `ThreadSortMode`/`ThreadListLayout` manually — importing
// the option tables would pull the icon module (lucide) into the store.
// Unknown persisted values (e.g. written by a newer app version) fall back to
// the defaults.
function sanitizeThreadSortMode(value: unknown): ThreadSortMode {
  return value === "updated" || value === "created" || value === "manual" ? value : "updated";
}

function sanitizeThreadListLayout(value: unknown): ThreadListLayout {
  return value === "grouped" || value === "flat" ? value : "grouped";
}

/**
 * A dock placement may only hold a tab whose content is still open. When a
 * panel closes itself (its close button, a removed worktree, a project going
 * away) the slot has to be released too — otherwise an empty section keeps its
 * header, and the bottom row it lives in, on screen with nothing inside.
 */
function releaseClosedTab(state: PanelState, tab: RightPanelTab): Partial<PanelState> {
  const { left, right } = state.bottomPanelDocks;
  return {
    ...(left === tab || right === tab
      ? {
          bottomPanelDocks: {
            left: left === tab ? null : left,
            right: right === tab ? null : right,
          },
        }
      : {}),
    ...(state.rightPanelSplit?.tab === tab ? { rightPanelSplit: null } : {}),
  };
}

/** Default rail offset: below the pane header, near the top of the conversation. */
const DEFAULT_THREAD_TOOL_RAIL_OFFSET = 56;

function sanitizeRailOffset(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THREAD_TOOL_RAIL_OFFSET;
  return Math.max(0, Math.round(value));
}

export const usePanelStore = create<PanelState>()((set) => ({
  gitReviewContext: initialPersisted
    ? (initialPersisted.gitReviewContext ?? null)
    : loadInitialGitContext(),
  gitReviewAsPanel: false,
  gitOverlayOpen: false,
  prReviewContext: null,
  githubActionsContext: null,
  filesPanelContext: null,
  subAgentPanelContext: null,
  subAgentPanelOpen: false,
  rightPanelTab: "git",
  rightPanelSplit: null,
  bottomPanelDocks: EMPTY_BOTTOM_PANEL_DOCKS,
  rightPanelFollowsThread: initialPersisted?.rightPanelFollowsThread ?? false,
  threadToolRailOffset: sanitizeRailOffset(
    initialPersisted?.threadToolRailOffset ?? DEFAULT_THREAD_TOOL_RAIL_OFFSET,
  ),
  browserPanelOpen: false,
  usagePanelOpen: false,
  notesPanelOpen: false,
  portsPanelOpen: false,
  browserOverlayOpen: false,
  browserOverlayMaximized: false,
  browserOverlayDrawerWidth: clampDrawerWidth(
    initialPersisted?.browserOverlayDrawerWidth ?? loadInitialDrawerWidth(),
  ),
  settingsOpen: false,
  settingsSection: null,
  projectSettingsId: null,
  threadSortMode: sanitizeThreadSortMode(initialPersisted?.threadSortMode),
  threadListLayout: sanitizeThreadListLayout(initialPersisted?.threadListLayout),
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
        prev.worktreePath === ctx.worktreePath &&
        prev.originComposerId === ctx.originComposerId)
    ) {
      return;
    }
    set((state) => ({
      gitReviewContext: ctx,
      ...(ctx === null ? releaseClosedTab(state, "git") : {}),
    }));
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
          prev.prKey === ctx.prKey &&
          prev.skipLocalSync === ctx.skipLocalSync)
      ) {
        return {};
      }
      return { prReviewContext: ctx };
    }),
  setGitHubActionsContext: (ctx) =>
    set((state) => {
      const prev = state.githubActionsContext;
      if (
        (prev === null && ctx === null) ||
        (prev !== null &&
          ctx !== null &&
          prev.projectId === ctx.projectId &&
          prev.runId === ctx.runId)
      ) {
        return {};
      }
      return { githubActionsContext: ctx };
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
      return {
        filesPanelContext: ctx,
        ...(ctx === null ? releaseClosedTab(state, "files") : {}),
      };
    }),
  setSubAgentPanelContext: (ctx) =>
    set((state) => {
      const prev = state.subAgentPanelContext;
      if (
        (prev === null && ctx === null) ||
        (prev !== null &&
          ctx !== null &&
          prev.threadId === ctx.threadId &&
          prev.parentItemId === ctx.parentItemId &&
          projectLocationsEqual(prev.projectLocation, ctx.projectLocation))
      ) {
        return ctx && !state.subAgentPanelOpen ? { subAgentPanelOpen: true } : {};
      }
      return { subAgentPanelContext: ctx, subAgentPanelOpen: ctx !== null };
    }),
  setRightPanelTab: (tab) =>
    set((state) => {
      const reopenSubAgent =
        tab === "subagent" && state.subAgentPanelContext !== null && !state.subAgentPanelOpen;
      if (state.rightPanelTab === tab && !reopenSubAgent) return {};
      return {
        rightPanelTab: tab,
        ...(reopenSubAgent ? { subAgentPanelOpen: true } : {}),
      };
    }),
  setRightPanelSplit: (split) =>
    set((state) => {
      const prev = state.rightPanelSplit;
      if (
        (prev === null && split === null) ||
        (prev !== null &&
          split !== null &&
          prev.tab === split.tab &&
          prev.placement === split.placement)
      ) {
        return {};
      }
      return { rightPanelSplit: split };
    }),
  setBottomPanelDock: (placement, tab) =>
    set((state) => {
      const other = placement === "left" ? "right" : "left";
      // A tab lives in exactly one place: dropping it in the opposite slot moves
      // it rather than rendering the same surface twice.
      const otherTab =
        tab !== null && state.bottomPanelDocks[other] === tab
          ? null
          : state.bottomPanelDocks[other];
      if (state.bottomPanelDocks[placement] === tab && state.bottomPanelDocks[other] === otherTab) {
        return {};
      }
      return {
        bottomPanelDocks: {
          ...EMPTY_BOTTOM_PANEL_DOCKS,
          [placement]: tab,
          [other]: otherTab,
        },
      };
    }),
  clearBottomPanelDockTab: (tab) =>
    set((state) => {
      const { left, right } = state.bottomPanelDocks;
      if (left !== tab && right !== tab) return {};
      return {
        bottomPanelDocks: {
          left: left === tab ? null : left,
          right: right === tab ? null : right,
        },
      };
    }),
  clearBottomPanelDocks: () =>
    set((state) =>
      state.bottomPanelDocks.left === null && state.bottomPanelDocks.right === null
        ? {}
        : { bottomPanelDocks: EMPTY_BOTTOM_PANEL_DOCKS },
    ),
  toggleRightPanelFollowsThread: () =>
    set((state) => ({ rightPanelFollowsThread: !state.rightPanelFollowsThread })),
  setThreadToolRailOffset: (offset) =>
    set((state) => {
      const clamped = sanitizeRailOffset(offset);
      // Return `state` (not `{}`) so Zustand's Object.is bailout actually skips
      // listener notification — this fires on every pointermove frame during drag.
      return state.threadToolRailOffset === clamped ? state : { threadToolRailOffset: clamped };
    }),
  // Toggling the docked right-panel browser is independent of the floating
  // overlay (drawer/fullscreen): hiding the panel must NOT tear down an active
  // overlay, otherwise maximizing the browser and then hiding the right panel
  // would make the fullscreen page vanish. Callers that genuinely want to
  // dismiss both (e.g. the last tab closing) close the overlay explicitly.
  setBrowserPanelOpen: (v) =>
    set((state) =>
      state.browserPanelOpen === v
        ? {}
        : { browserPanelOpen: v, ...(v ? {} : releaseClosedTab(state, "browser")) },
    ),
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
    set((state) =>
      state.usagePanelOpen === v
        ? {}
        : { usagePanelOpen: v, ...(v ? {} : releaseClosedTab(state, "usage")) },
    ),
  openUsagePanel: () =>
    set((state) =>
      state.usagePanelOpen && state.rightPanelTab === "usage"
        ? {}
        : { usagePanelOpen: true, rightPanelTab: "usage" as const },
    ),
  setNotesPanelOpen: (v) =>
    set((state) =>
      state.notesPanelOpen === v
        ? {}
        : { notesPanelOpen: v, ...(v ? {} : releaseClosedTab(state, "notes")) },
    ),
  openNotesPanel: () =>
    set((state) =>
      state.notesPanelOpen && state.rightPanelTab === "notes"
        ? {}
        : { notesPanelOpen: true, rightPanelTab: "notes" as const },
    ),
  setPortsPanelOpen: (v) =>
    set((state) => (state.portsPanelOpen === v ? {} : { portsPanelOpen: v })),
  openPortsPanel: () =>
    set((state) =>
      state.portsPanelOpen && state.rightPanelTab === "ports"
        ? {}
        : { portsPanelOpen: true, rightPanelTab: "ports" as const },
    ),
  setThreadSortMode: (mode) =>
    set((state) => (state.threadSortMode === mode ? {} : { threadSortMode: mode })),
  setThreadListLayout: (layout) =>
    set((state) => (state.threadListLayout === layout ? {} : { threadListLayout: layout })),
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
      // that fires when the window shrinks — must not tear down a standalone
      // browser overlay or the temporary subagent target. The latter has its own
      // explicit close control in the panel header.
      //
      // Bottom-docked tabs are likewise a separate surface: hiding the right
      // panel must leave them (and the open flag that feeds their content)
      // alone, otherwise a docked Usage/Git would blank out beside the terminal.
      const { left, right } = state.bottomPanelDocks;
      const isDocked = (tab: RightPanelTab) => left === tab || right === tab;
      const next = {
        ...(isDocked("git") ? {} : { gitReviewContext: null }),
        ...(isDocked("files") ? {} : { filesPanelContext: null }),
        ...(isDocked("browser") ? {} : { browserPanelOpen: false }),
        ...(isDocked("usage") ? {} : { usagePanelOpen: false }),
        ...(isDocked("notes") ? {} : { notesPanelOpen: false }),
        portsPanelOpen: false,
        subAgentPanelOpen: false,
        rightPanelSplit: null,
      };
      const alreadyClosed =
        (next.gitReviewContext === undefined || state.gitReviewContext === null) &&
        (next.filesPanelContext === undefined || state.filesPanelContext === null) &&
        !state.subAgentPanelOpen &&
        (next.browserPanelOpen === undefined || !state.browserPanelOpen) &&
        (next.usagePanelOpen === undefined || !state.usagePanelOpen) &&
        (next.notesPanelOpen === undefined || !state.notesPanelOpen) &&
        !state.portsPanelOpen &&
        state.rightPanelSplit === null;
      return alreadyClosed ? {} : next;
    });
  },
}));

// Only the cross-launch slices persist; every other panel/overlay flag is
// session-scoped and resets on launch. Persisting just this slice keeps the
// frequent session-only toggles (right-panel tab, settings/search/modal open,
// …) off localStorage — they change the store constantly but never the
// persisted value. The thread sort/layout mode persists so a flat-list user
// isn't reset to project grouping on relaunch. Initial hydration is
// synchronous, seeded above from readPersistedSlice so the restored git panel
// and drawer width are present before first paint.
persistStoreSlice(usePanelStore, PERSIST_KEY, (state) => ({
  gitReviewContext: state.gitReviewContext
    ? {
        projectId: state.gitReviewContext.projectId,
        ...(state.gitReviewContext.worktreePath
          ? { worktreePath: state.gitReviewContext.worktreePath }
          : {}),
      }
    : null,
  browserOverlayDrawerWidth: state.browserOverlayDrawerWidth,
  rightPanelFollowsThread: state.rightPanelFollowsThread,
  threadToolRailOffset: state.threadToolRailOffset,
  threadSortMode: state.threadSortMode,
  threadListLayout: state.threadListLayout,
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
    p.githubActionsContext !== null ||
    p.threadSearchOpen
  ) {
    return true;
  }
  // File editor modal and fullscreen both cover the right panel — including
  // modal (not only fullscreen) so PDF/browser preview isn't hidden behind it.
  return useFileEditorStore.getState().overlayMode !== null;
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
