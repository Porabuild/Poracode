import { useEffect, useLayoutEffect, useRef } from "react";
import type { AppView } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import {
  usePanelStore,
  type GitHubActionsContext,
  type MobileUtilityPage,
} from "@/renderer/state/panelStore";

const HISTORY_KEY = "__poracodeMobilePage";

const MOBILE_PAGES = new Set<MobileUtilityPage>([
  "profile",
  "usage",
  "projects",
  "terminal",
  "browser",
  "ports",
  "notes",
  "workspace",
  "pullRequests",
  "schedules",
  "githubActions",
  "subagent",
  "projectSettings",
  "settings",
]);

type CompactViewEntry =
  | { readonly kind: "home" }
  | { readonly kind: "thread"; readonly threadId: string }
  | { readonly kind: "draft"; readonly projectId: string }
  | { readonly kind: "experiment"; readonly experimentId: string; readonly projectId: string }
  | { readonly kind: "pullRequests" }
  | { readonly kind: "schedules" };

interface MobileHistoryEntry {
  readonly page?: MobileUtilityPage;
  readonly settingsSection?: string;
  readonly githubActionsContext?: GitHubActionsContext;
  readonly projectSettingsId?: string;
  readonly workspaceContext?: {
    readonly projectId: string;
    readonly worktreePath?: string;
  };
  readonly subagentContext?: SubAgentHistoryContext;
  readonly view?: CompactViewEntry;
}

interface SubAgentHistoryContext {
  readonly threadId: string;
  readonly parentItemId: string;
}

function readHistoryObject(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state !== null && typeof state === "object" ? (state as Record<string, unknown>) : {};
}

/** Only the durable target — never the panel's project location or origin flags. */
function readSubAgentHistoryContext(candidate: unknown): SubAgentHistoryContext | undefined {
  if (candidate === null || typeof candidate !== "object") return undefined;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.threadId !== "string" ||
    record.threadId.length === 0 ||
    typeof record.parentItemId !== "string" ||
    record.parentItemId.length === 0
  ) {
    return undefined;
  }
  return { threadId: record.threadId, parentItemId: record.parentItemId };
}

function readCompactViewEntry(candidate: unknown): CompactViewEntry | undefined {
  if (candidate === null || typeof candidate !== "object") return undefined;
  const record = candidate as Record<string, unknown>;
  if (record.kind === "home") return { kind: "home" };
  if (record.kind === "thread" && typeof record.threadId === "string" && record.threadId.length > 0)
    return { kind: "thread", threadId: record.threadId };
  if (
    record.kind === "draft" &&
    typeof record.projectId === "string" &&
    record.projectId.length > 0
  )
    return { kind: "draft", projectId: record.projectId };
  if (
    record.kind === "experiment" &&
    typeof record.experimentId === "string" &&
    record.experimentId.length > 0 &&
    typeof record.projectId === "string" &&
    record.projectId.length > 0
  ) {
    return { kind: "experiment", experimentId: record.experimentId, projectId: record.projectId };
  }
  if (record.kind === "pullRequests") return { kind: "pullRequests" };
  if (record.kind === "schedules") return { kind: "schedules" };
  return undefined;
}

function readHistoryEntry(): MobileHistoryEntry | null {
  const candidate = readHistoryObject()[HISTORY_KEY];
  if (candidate === null || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;

  const page =
    typeof record.page === "string" && MOBILE_PAGES.has(record.page as MobileUtilityPage)
      ? (record.page as MobileUtilityPage)
      : undefined;
  const view = readCompactViewEntry(record.view);
  if (page === undefined && view === undefined) return null;

  const subagentContext = readSubAgentHistoryContext(record.subagentContext);
  // A malformed subagent page must not discard a valid parent view that was
  // serialized alongside it. Drop only the unusable page.
  const usablePage = page === "subagent" && subagentContext === undefined ? undefined : page;
  if (usablePage === undefined && view === undefined) return null;

  const settingsSection =
    typeof record.settingsSection === "string" ? record.settingsSection : undefined;
  const githubCandidate = record.githubActionsContext;
  const githubActionsContext =
    githubCandidate !== null && typeof githubCandidate === "object"
      ? (githubCandidate as GitHubActionsContext)
      : undefined;
  const projectSettingsId =
    typeof record.projectSettingsId === "string" ? record.projectSettingsId : undefined;
  const workspaceCandidate = record.workspaceContext;
  const workspaceRecord =
    workspaceCandidate !== null && typeof workspaceCandidate === "object"
      ? (workspaceCandidate as Record<string, unknown>)
      : null;
  const workspaceContext =
    workspaceRecord && typeof workspaceRecord.projectId === "string"
      ? {
          projectId: workspaceRecord.projectId,
          ...(typeof workspaceRecord.worktreePath === "string"
            ? { worktreePath: workspaceRecord.worktreePath }
            : {}),
        }
      : undefined;

  if (page === "projectSettings" && projectSettingsId === undefined) return null;

  return {
    ...(usablePage !== undefined ? { page: usablePage } : {}),
    ...(settingsSection !== undefined ? { settingsSection } : {}),
    ...(githubActionsContext !== undefined ? { githubActionsContext } : {}),
    ...(projectSettingsId !== undefined ? { projectSettingsId } : {}),
    ...(workspaceContext !== undefined ? { workspaceContext } : {}),
    ...(subagentContext !== undefined && usablePage === "subagent" ? { subagentContext } : {}),
    ...(view !== undefined ? { view } : {}),
  };
}

function compactViewFromAppState(view: AppView, focusedPaneId: string | null): CompactViewEntry {
  if (view.kind === "thread") {
    const threadId =
      focusedPaneId && view.panes.includes(focusedPaneId) ? focusedPaneId : view.panes[0];
    if (threadId) return { kind: "thread", threadId };
    return { kind: "home" };
  }
  if (view.kind === "draft") return { kind: "draft", projectId: view.projectId };
  if (view.kind === "experiment") {
    return { kind: "experiment", experimentId: view.experimentId, projectId: view.projectId };
  }
  if (view.kind === "pullRequests") return { kind: "pullRequests" };
  if (view.kind === "schedules") return { kind: "schedules" };
  return { kind: "home" };
}

function routeKeyFor(
  page: MobileUtilityPage | null,
  view: CompactViewEntry,
  subagentContext?: SubAgentHistoryContext,
): string {
  if (page === "subagent") {
    return subagentContext
      ? `page:subagent:${subagentContext.threadId}:${subagentContext.parentItemId}`
      : "page:subagent";
  }
  if (page !== null) return `page:${page}`;
  if (view.kind === "thread") return `thread:${view.threadId}`;
  if (view.kind === "draft") return `draft:${view.projectId}`;
  if (view.kind === "experiment") return `experiment:${view.experimentId}`;
  if (view.kind === "pullRequests") return "view:pullRequests";
  if (view.kind === "schedules") return "view:schedules";
  return "home";
}

function routeKeyFromHistoryEntry(entry: MobileHistoryEntry | null): string {
  if (!entry) return "home";
  return routeKeyFor(entry.page ?? null, entry.view ?? { kind: "home" }, entry.subagentContext);
}

/**
 * Traverse away from the current compact page or thread without clearing it
 * first. Clearing the store before calling Back briefly renders Home and can
 * lose the page-to-page return target (for example Usage -> Settings -> Usage,
 * or Home -> Thread -> Notes -> Thread -> Home).
 */
export function navigateBackMobilePage(): boolean {
  if (readHistoryEntry() === null) return false;
  window.history.back();
  return true;
}

function applyCompactView(view: CompactViewEntry): void {
  const app = useAppStore.getState();
  if (view.kind === "home") {
    if (app.view.kind !== "home") app.openHome();
    return;
  }
  if (view.kind === "thread") {
    const exists = app.threads.some((thread) => thread.id === view.threadId);
    if (exists) {
      app.openThread(view.threadId);
    } else if (app.view.kind !== "home") {
      app.openHome();
    }
    return;
  }
  if (view.kind === "draft") {
    const exists = app.projects.some((project) => project.id === view.projectId);
    if (exists) {
      app.openDraft(view.projectId);
    } else if (app.view.kind !== "home") {
      app.openHome();
    }
    return;
  }
  if (view.kind === "experiment") {
    app.openExperiment(view.experimentId, view.projectId);
    return;
  }
  if (view.kind === "pullRequests") {
    app.openPullRequests();
    return;
  }
  if (view.kind === "schedules") {
    app.openSchedules();
  }
}

function applyHistoryEntry(entry: MobileHistoryEntry | null): void {
  const state = usePanelStore.getState();
  const previousPage = state.mobileUtilityPage;
  const nextPage = entry?.page ?? null;
  const subagentContext = nextPage === "subagent" ? entry?.subagentContext : undefined;
  if (state.mobileUtilityPage === "terminal" && nextPage !== "terminal") {
    useDevTerminalStore.getState().closePanel();
  }
  const workspaceContext =
    nextPage === "workspace" ? (entry?.workspaceContext ?? state.gitReviewContext) : null;
  const leavingWorkspace = state.mobileUtilityPage === "workspace" && nextPage !== "workspace";
  usePanelStore.setState({
    mobileUtilityPage: nextPage,
    settingsOpen: false,
    settingsSection: nextPage === "settings" ? (entry?.settingsSection ?? null) : null,
    githubActionsContext:
      nextPage === "githubActions"
        ? (entry?.githubActionsContext ?? state.githubActionsContext)
        : null,
    projectSettingsId: nextPage === "projectSettings" ? (entry?.projectSettingsId ?? null) : null,
    // History restores the page, not a one-shot deep link into one of its sections.
    projectSettingsSection: null,
    ...(nextPage === "subagent" && subagentContext
      ? { subAgentPanelContext: subagentContext, subAgentPanelOpen: true }
      : previousPage === "subagent"
        ? { subAgentPanelContext: null, subAgentPanelOpen: false }
        : {}),
    ...(nextPage === "workspace" && workspaceContext
      ? { gitReviewContext: workspaceContext }
      : leavingWorkspace
        ? { gitOverlayOpen: false, gitReviewContext: null, filesPanelContext: null }
        : {}),
  });
  if (entry === null) {
    applyCompactView({ kind: "home" });
  } else if (subagentContext !== undefined) {
    // Reload/Back/Forward restores the subagent page together with its owning
    // parent thread. When the catalog has not arrived yet, the page keeps its
    // loading surface and MobileUtilityPage focuses the thread once it appears.
    const app = useAppStore.getState();
    if (app.threads.some((thread) => thread.id === subagentContext.threadId)) {
      app.openThread(subagentContext.threadId);
    }
  } else if (entry.view !== undefined) {
    applyCompactView(entry.view);
  }
}

function buildHistoryEntry(
  page: MobileUtilityPage | null,
  settingsSection: string | null,
  githubActionsContext: GitHubActionsContext | null,
  projectSettingsId: string | null,
  workspaceContext: { readonly projectId: string; readonly worktreePath?: string } | null,
  subagentContext: SubAgentHistoryContext | null,
  view: CompactViewEntry,
): MobileHistoryEntry {
  return {
    ...(page !== null ? { page } : {}),
    ...(page === "settings" && settingsSection !== null ? { settingsSection } : {}),
    ...(page === "githubActions" && githubActionsContext !== null ? { githubActionsContext } : {}),
    ...(page === "projectSettings" && projectSettingsId !== null ? { projectSettingsId } : {}),
    ...(page === "workspace" && workspaceContext !== null ? { workspaceContext } : {}),
    ...(page === "subagent" && subagentContext !== null ? { subagentContext } : {}),
    ...(view.kind !== "home" ? { view } : {}),
  };
}

/**
 * Gives compact PWA pages and threads native-feeling Back/Forward (including
 * iOS edge swipe-back) and reload semantics without adding a URL router to the
 * shared Electron renderer.
 */
export function useMobilePageHistory(compactLayout: boolean): void {
  const page = usePanelStore((state) => state.mobileUtilityPage);
  const settingsSection = usePanelStore((state) => state.settingsSection);
  const githubActionsContext = usePanelStore((state) => state.githubActionsContext);
  const projectSettingsId = usePanelStore((state) => state.projectSettingsId);
  const gitReviewContext = usePanelStore((state) => state.gitReviewContext);
  const subAgentPanelContext = usePanelStore((state) => state.subAgentPanelContext);
  const subagentThreadId = subAgentPanelContext?.threadId;
  const subagentParentItemId = subAgentPanelContext?.parentItemId;
  const appView = useAppStore((state) => state.view);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const compactView = compactViewFromAppState(appView, focusedPaneId);
  const subagentContext =
    page === "subagent" && subagentThreadId && subagentParentItemId
      ? { threadId: subagentThreadId, parentItemId: subagentParentItemId }
      : null;
  const routeKey = routeKeyFor(page, compactView, subagentContext ?? undefined);
  const applyingHistoryRef = useRef<{ routeKey: string } | null>(null);
  const previousRouteRef = useRef<string>(routeKey);
  const historyDepthRef = useRef<number>(0);

  useLayoutEffect(() => {
    if (!compactLayout) return;
    const entry = readHistoryEntry();
    if (entry === null) return;
    const restoredKey = routeKeyFromHistoryEntry(entry);
    applyingHistoryRef.current = { routeKey: restoredKey };
    previousRouteRef.current = restoredKey;
    historyDepthRef.current = Math.max(historyDepthRef.current, 1);
    applyHistoryEntry(entry);
  }, [compactLayout]);

  useEffect(() => {
    if (!compactLayout) return;
    const onPopState = () => {
      const entry = readHistoryEntry();
      const restoredKey = routeKeyFromHistoryEntry(entry);
      applyingHistoryRef.current = { routeKey: restoredKey };
      previousRouteRef.current = restoredKey;
      historyDepthRef.current = entry === null ? 0 : Math.max(1, historyDepthRef.current - 1);
      applyHistoryEntry(entry);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [compactLayout]);

  useEffect(() => {
    // Restoration runs in a layout effect. Its synchronous store write can
    // leave this commit's passive effect holding the previous route snapshot.
    // Wait for the matching render rather than consuming the restoration and
    // pushing the restored route again on the next commit.
    const liveApp = useAppStore.getState();
    const livePanel = usePanelStore.getState();
    const liveSubagentContext =
      livePanel.mobileUtilityPage === "subagent" && livePanel.subAgentPanelContext
        ? {
            threadId: livePanel.subAgentPanelContext.threadId,
            parentItemId: livePanel.subAgentPanelContext.parentItemId,
          }
        : undefined;
    const liveRouteKey = routeKeyFor(
      livePanel.mobileUtilityPage,
      compactViewFromAppState(liveApp.view, liveApp.focusedPaneId),
      liveSubagentContext,
    );
    if (routeKey !== liveRouteKey) return;
    if (!compactLayout) {
      if (page !== null) usePanelStore.setState({ mobileUtilityPage: null });
      return;
    }

    const restoration = applyingHistoryRef.current;
    if (restoration) {
      applyingHistoryRef.current = null;
      if (restoration.routeKey === routeKey) {
        previousRouteRef.current = routeKey;
        return;
      }
    }

    const previousRoute = previousRouteRef.current;
    if (routeKey === previousRoute) return;
    previousRouteRef.current = routeKey;

    const currentHistory = readHistoryEntry();
    const workspaceContext = gitReviewContext
      ? {
          projectId: gitReviewContext.projectId,
          ...(gitReviewContext.worktreePath !== undefined
            ? { worktreePath: gitReviewContext.worktreePath }
            : {}),
        }
      : null;
    const historySubagentContext =
      subagentThreadId && subagentParentItemId
        ? { threadId: subagentThreadId, parentItemId: subagentParentItemId }
        : null;
    // Closing a utility page while on a thread/draft/etc. must pop the utility
    // page back to the underlying view instead of pushing a duplicate thread
    // entry on top of the closed utility page.
    if (previousRoute.startsWith("page:") && !routeKey.startsWith("page:")) {
      if (currentHistory?.page !== undefined) {
        if (historyDepthRef.current > 1 || routeKey === "home") {
          historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);
          window.history.back();
          return;
        }
        if (routeKey !== "home") {
          window.history.replaceState(
            {
              ...readHistoryObject(),
              [HISTORY_KEY]: buildHistoryEntry(
                null,
                settingsSection,
                githubActionsContext,
                projectSettingsId,
                workspaceContext,
                historySubagentContext,
                compactView,
              ),
            },
            "",
          );
          return;
        }
      }
    }

    if (routeKey !== "home") {
      historyDepthRef.current += 1;
      window.history.pushState(
        {
          ...readHistoryObject(),
          [HISTORY_KEY]: buildHistoryEntry(
            page,
            settingsSection,
            githubActionsContext,
            projectSettingsId,
            workspaceContext,
            historySubagentContext,
            compactView,
          ),
        },
        "",
      );
      return;
    }

    if (previousRoute !== "home" && currentHistory !== null) {
      if (historyDepthRef.current <= 1) {
        historyDepthRef.current = 0;
        window.history.back();
      } else {
        historyDepthRef.current = 0;
        const nextState = { ...readHistoryObject() };
        delete nextState[HISTORY_KEY];
        window.history.replaceState(nextState, "");
      }
    }
  }, [
    compactLayout,
    compactView,
    gitReviewContext,
    githubActionsContext,
    page,
    projectSettingsId,
    routeKey,
    settingsSection,
    subagentParentItemId,
    subagentThreadId,
  ]);
}
