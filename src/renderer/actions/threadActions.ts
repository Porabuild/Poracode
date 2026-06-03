import { startTransition } from "react";
import type {
  AgentStatus,
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { isHomeProject } from "@/shared/homeScope";
import { isDraftPaneId } from "@/shared/paneId";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { readWorktreeDeletePref } from "@/renderer/views/MainView/parts/Sidebar/parts/DeleteWorktreeDialog";
import { buildProjectDraftConfig } from "@/renderer/views/MainView/parts/AppContent/draftConfig";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import {
  closeThreads,
  normalizeShellScript,
  startShellWithToast,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { closeAllPanels, closePanelsForUnloadedThread } from "./panelActions";
import { getCurrentProjectId } from "./currentProject";
import { performWorktreeRemoval } from "./worktreeActions";

let openThreadRequestId = 0;

export function openNewThread(projectId?: string): void {
  openThreadRequestId += 1;
  const store = useAppStore.getState();
  const targetProjectId =
    projectId ??
    getCurrentProjectId() ??
    (useSharedSettings.getState().homeScopeEnabled
      ? store.projects.find(isHomeProject)?.id
      : undefined) ??
    store.projects.find((project) => !project.disabled && !isHomeProject(project))?.id;
  startTransition(() => {
    if (!targetProjectId) {
      useAppStore.getState().openHome();
      return;
    }
    const mode = useSharedSettings.getState().newThreadMode;
    const view = useAppStore.getState().view;
    if (mode === "panel" && view.kind === "thread" && view.panes.length > 0) {
      useAppStore.getState().openDraftSideBySide(targetProjectId);
    } else {
      useAppStore.getState().openDraft(targetProjectId);
    }
  });
}

export function openNewThreadSideBySide(projectId: string): void {
  openThreadRequestId += 1;
  startTransition(() => {
    useAppStore.getState().openDraftSideBySide(projectId);
  });
}

export function openNewThreadInWorktree(input: {
  projectId: string;
  worktreePath: string;
  worktreeBranch: string;
}): void {
  openThreadRequestId += 1;
  startTransition(() => {
    const store = useAppStore.getState();
    store.setPendingDraftWorktreeSelection(input.projectId, {
      branch: input.worktreeBranch,
      baseBranch: input.worktreeBranch,
      isWorktree: true,
      worktreePath: input.worktreePath,
    });
    const mode = useSharedSettings.getState().newThreadMode;
    const view = useAppStore.getState().view;
    if (mode === "panel" && view.kind === "thread" && view.panes.length > 0) {
      useAppStore.getState().openDraftSideBySide(input.projectId);
    } else {
      useAppStore.getState().openDraft(input.projectId);
    }
  });
}

export type DraftThreadStartInput = {
  agentKind: AgentStatus["kind"];
  config: ThreadConfig;
  prompt: string;
  segments?: PromptSegment[];
  existingWorktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  worktreeIsNewBranch?: boolean;
  presentationMode?: ThreadPresentationMode;
};

export async function startThreadFromDraft(
  project: Project,
  input: DraftThreadStartInput,
  options: { replacePaneId?: string; preserveActiveGroup?: boolean } = {},
): Promise<Thread | null> {
  const {
    agentKind,
    config,
    prompt,
    segments,
    existingWorktreePath,
    worktreeBranch,
    worktreeBaseBranch,
    worktreeIsNewBranch,
    presentationMode,
  } = input;
  const isHomeScope = isHomeProject(project);
  const store = useAppStore.getState();

  store.updateProjectDraftConfig(
    project.id,
    buildProjectDraftConfig({
      agentKind,
      config,
      worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
    }),
  );

  let worktreePath: string | undefined;
  let newWorktreeSetupPath: string | undefined;
  if (isHomeScope) {
    worktreePath = undefined;
  } else if (existingWorktreePath) {
    worktreePath = existingWorktreePath;
  } else if (worktreeBranch) {
    try {
      const result = await readBridge().gitAddWorktree({
        projectLocation: project.location,
        branch: worktreeBranch,
        createBranch: worktreeIsNewBranch ?? false,
        startPoint: worktreeBaseBranch,
      });
      worktreePath = result.path;
      newWorktreeSetupPath = result.path;
    } catch (err) {
      console.error("[renderer] failed to create worktree:", err);
      return null;
    }
  }

  const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const titlePrompt = segments
    ? segments
        .filter((s) => s.kind !== "attachment")
        .map((s) => (s.kind === "file" ? `@${s.path}` : s.content))
        .join("")
        .trim() || prompt
    : prompt;
  const currentView = useAppStore.getState().view;
  const activeGroup =
    options.preserveActiveGroup !== false &&
    currentView.kind === "thread" &&
    currentView.activeGroupId
      ? {
          groupId: currentView.activeGroupId,
          groupName: useAppStore
            .getState()
            .threads.find((t) => t.groupId === currentView.activeGroupId)?.groupName,
        }
      : undefined;

  const thread = useAppStore.getState().createThread({
    projectId: project.id,
    agentKind,
    config,
    prompt: titlePrompt,
    ...(presentationMode ? { presentationMode } : {}),
    ...(worktreePath ? { worktreePath, worktreeBranch } : {}),
    ...(options.replacePaneId ? { replacePaneId: options.replacePaneId } : {}),
    ...(activeGroup?.groupId ? { groupId: activeGroup.groupId } : {}),
    ...(activeGroup?.groupName ? { groupName: activeGroup.groupName } : {}),
  });
  useAppStore.getState().queueThreadLaunch(thread.id, prompt, segments);
  generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
  if (worktreePath) {
    void primeWorktreeGitState(project, worktreePath);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
  if (newWorktreeSetupPath) {
    const setupScript = project.scripts?.setupScript;
    if (setupScript) {
      runWorktreeSetupScript(project, newWorktreeSetupPath, setupScript);
    }
  }
  return thread;
}

export function openThread(threadId: string, options?: { focusComposer?: boolean }): void {
  const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
  const requestId = ++openThreadRequestId;
  const threadIdsToHydrate = getGuiThreadIdsToHydrateBeforeOpen(threadId);

  const applyOpen = () => {
    if (requestId !== openThreadRequestId) return;

    startTransition(() => {
      useAppStore.getState().openThread(threadId);
      if (options?.focusComposer) {
        useAppStore.getState().requestComposerFocus(threadId);
      }
      // Late-rendering items (virtualizer measurement, hydration, streaming) can
      // leave the chat slightly above the bottom on reopen. Re-arm stick-to-bottom
      // so any post-mount growth keeps the view pinned.
      if (thread?.presentationMode === "gui") {
        useAppStore.getState().requestChatScrollToBottom(threadId);
      }
    });

    if (thread?.status === "inactive") {
      reopenStoredThread(threadId);
    }
  };

  if (threadIdsToHydrate.length > 0) {
    void Promise.all(threadIdsToHydrate.map((id) => hydrateThreadRuntimeItems(id))).then(
      applyOpen,
      applyOpen,
    );
    return;
  }

  applyOpen();
}

function getGuiThreadIdsToHydrateBeforeOpen(threadId: string): string[] {
  const state = useAppStore.getState();
  const clickedThread = state.threads.find((thread) => thread.id === threadId);
  if (!clickedThread) return [];

  let candidates = [clickedThread];
  if (clickedThread.groupId) {
    const groupThreads = state.threads.filter(
      (thread) => thread.groupId === clickedThread.groupId && !thread.done && !thread.archived,
    );
    if (groupThreads.length >= 2) {
      candidates = groupThreads;
    }
  }

  return candidates
    .filter(
      (thread) => thread.presentationMode === "gui" && !hasHydratedThreadRuntimeItems(thread.id),
    )
    .map((thread) => thread.id);
}

export function reopenStoredThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread) return;
  if (thread.status !== "inactive" || store.pendingThreadLaunches[thread.id] !== undefined) {
    return;
  }

  const isGuiReconnect = thread.presentationMode === "gui" && thread.sessionRef !== undefined;
  startTransition(() => {
    store.updateThreadRuntime(thread.id, {
      status: isGuiReconnect ? "idle" : "launching",
      attention: "none",
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
    });
  });
  store.queueThreadLaunch(thread.id, "");
}

export async function unloadStoredThread(
  threadId: string,
  options?: { closeThreadPane?: boolean; keepSidePanels?: boolean },
): Promise<void> {
  const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
  if (!thread || thread.status === "inactive") {
    return;
  }

  const view = useAppStore.getState().view;
  const inVisiblePane = view.kind === "thread" && view.panes.includes(threadId);

  await readBridge().closeThread({ threadId });
  startTransition(() => {
    useAppStore.getState().markThreadExited(threadId);
    if (inVisiblePane && !options?.keepSidePanels) {
      closePanelsForUnloadedThread(thread);
    }
    if (options?.closeThreadPane && inVisiblePane) {
      useAppStore.getState().closePane(threadId);
    }
  });
}

export function sweepStaleThreads(): void {
  const staleThreadUnloadMinutes = useSharedSettings.getState().staleThreadUnloadMinutes;
  if (staleThreadUnloadMinutes <= 0) return;

  const store = useAppStore.getState();
  const visibleThreadIds = new Set(store.view.kind === "thread" ? store.view.panes : []);
  const staleBefore = Date.now() - staleThreadUnloadMinutes * 60_000;

  for (const thread of store.threads) {
    if (visibleThreadIds.has(thread.id) || thread.status !== "idle" || !thread.sessionRef) {
      continue;
    }
    const updatedAtMs = new Date(thread.updatedAt).getTime();
    const lastViewedAtMs = store.lastViewedAtByThreadId[thread.id] ?? 0;
    const lastActiveMs = Math.max(updatedAtMs, lastViewedAtMs);
    if (lastActiveMs > staleBefore) {
      continue;
    }

    void unloadStoredThread(thread.id).catch(() => undefined);
  }
}

export function archiveThread(threadId: string): void {
  void unloadStoredThread(threadId).catch(() => undefined);
  useAppStore.getState().archiveThread(threadId);
}

export function unloadThread(threadId: string): void {
  void unloadStoredThread(threadId, { closeThreadPane: true }).catch(() => undefined);
}

export function toggleMarkThreadDone(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  if (thread.done) {
    store.unmarkThreadDone(threadId);
  } else {
    void unloadStoredThread(threadId, { keepSidePanels: true }).catch(() => undefined);
    const worktreePath = thread.worktreePath;
    const isLastOpenWorktreeThread =
      worktreePath !== undefined &&
      store.threads.every(
        (t) => t.id === threadId || t.worktreePath !== worktreePath || t.done || t.archived,
      );
    if (worktreePath && isLastOpenWorktreeThread) {
      const termStore = useDevTerminalStore.getState();
      const removedTabIds = termStore.removeTabsForWorktree(worktreePath);
      void closeThreads(removedTabIds);
      if (termStore.isOpen && termStore.activeWorktreePath === worktreePath) {
        termStore.closePanel();
      }
    }
    store.markThreadDone(threadId);
  }
}

export function toggleStarThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  if (thread.starred) {
    store.unstarThread(threadId);
  } else {
    store.starThread(threadId);
  }
}

export function renameThread(threadId: string, title: string): void {
  useAppStore.getState().renameThread(threadId, title);
}

function deleteThreadOnly(threadId: string): void {
  useAppStore.getState().deleteThread(threadId);
  void readBridge()
    .closeThread({ threadId })
    .catch(() => undefined);
}

export function deleteThread(threadId: string, worktreePath?: string, projectId?: string): void {
  if (!worktreePath) {
    deleteThreadOnly(threadId);
    return;
  }

  const allThreads = useAppStore.getState().threads;
  const siblings = allThreads.filter((t) => t.worktreePath === worktreePath && t.id !== threadId);

  // Other threads still use this worktree — delete the thread without offering worktree removal.
  if (siblings.length > 0) {
    deleteThreadOnly(threadId);
    return;
  }

  const pref = readWorktreeDeletePref();
  if (pref === "thread-only") {
    deleteThreadOnly(threadId);
    return;
  }

  if (pref === "thread-and-worktree") {
    const thread = allThreads.find((t) => t.id === threadId);
    useAppStore.getState().deleteThread(threadId);

    const project = useAppStore.getState().projects.find((p) => p.id === projectId);
    if (project) {
      void (async () => {
        await closeThreads([threadId]);
        await performWorktreeRemoval(project, worktreePath, thread?.worktreeBranch);
      })();
    }
    return;
  }

  const thread = allThreads.find((t) => t.id === threadId);
  useWorktreeDeleteStore.getState().setDialog({
    kind: "single-thread",
    threadId,
    projectId: projectId!,
    worktreePath,
    worktreeBranch:
      resolveWorktreeBranch(projectId!, worktreePath, thread?.worktreeBranch) ??
      worktreePath.split(/[/\\]/).pop() ??
      worktreePath,
  });
}

export function continueInProvider(threadId: string): void {
  openThread(threadId);
}

export function reopenPaneThreadsIfInactive(): void {
  const store = useAppStore.getState();
  if (store.view.kind !== "thread") return;
  for (const paneId of store.view.panes) {
    if (isDraftPaneId(paneId)) continue;
    const thread = store.threads.find((t) => t.id === paneId);
    if (!thread || thread.status !== "inactive") continue;
    reopenStoredThread(thread.id);
  }
}

async function primeWorktreeGitState(project: Project, worktreePath: string): Promise<void> {
  const cachedWorktreePaths =
    useGitStore
      .getState()
      .worktrees[project.id]?.filter((worktree) => !worktree.isMain)
      .map((worktree) => worktree.path) ?? [];
  const threadWorktreePaths = useAppStore
    .getState()
    .threads.flatMap((thread) =>
      thread.projectId === project.id && thread.worktreePath ? [thread.worktreePath] : [],
    );
  const worktreePaths = [
    ...new Set([...cachedWorktreePaths, ...threadWorktreePaths, worktreePath]),
  ].sort();
  const watchWorktrees = readBridge()
    .gitWatchWorktrees({ projectId: project.id, worktreePaths })
    .catch(() => undefined);
  if (project.location.kind === "wsl") return;
  await watchWorktrees;
  void readBridge()
    .getGitStatus({ projectLocation: buildWorktreeLocation(project.location, worktreePath) })
    .then((status) => useGitStore.getState().setWorktreeStatus(worktreePath, status))
    .catch(() => undefined);
}

function runWorktreeSetupScript(project: Project, worktreePath: string, setupScript: string): void {
  if (!normalizeShellScript(setupScript)) return;

  const wtLocation = buildWorktreeLocation(project.location, worktreePath);
  const store = useDevTerminalStore.getState();
  const tab = store.addTab(project.id, "setup", worktreePath);
  const autoShow = useSharedSettings.getState().autoShowTerminalPanel;
  const panelAlreadyOpen = store.isOpen;
  if (autoShow) {
    store.openWorktreePanel(project.id, worktreePath);
  }
  store.setActiveTab(tab.id);

  if (!autoShow && !panelAlreadyOpen) {
    startShellWithToast(
      {
        shellId: tab.id,
        projectLocation: wtLocation,
        worktreePath,
      },
      "setup shell",
    );
  }

  const detach = writeScriptToShellThenExitOnSuccess(tab.id, setupScript, wtLocation.kind, () =>
    removeWorktreeSetupTab(tab),
  );
  const unsubscribeTabs = useDevTerminalStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;
    if (state.tabs.some((t) => t.id === tab.id)) return;
    detach();
    unsubscribeTabs();
  });
}

function removeWorktreeSetupTab(tab: DevTerminalTab): void {
  const store = useDevTerminalStore.getState();
  const showingThisContext =
    store.isOpen &&
    store.activeProjectId === tab.projectId &&
    (store.activeWorktreePath ?? undefined) === tab.worktreePath;
  store.removeTab(tab.id);
  if (!showingThisContext) return;
  const remaining = useDevTerminalStore
    .getState()
    .tabs.filter((t) => t.projectId === tab.projectId && t.worktreePath === tab.worktreePath);
  if (remaining.length > 0) return;
  if (useSharedSettings.getState().terminalPosition !== "bottom") closeAllPanels();
  useDevTerminalStore.getState().closePanel();
}
