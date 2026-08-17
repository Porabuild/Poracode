import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import type {
  Project,
  ProjectLocation,
  PromptSegment,
  TerminalSize,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { resolveProjectLocation } from "@/shared/worktree";
import { friendlyError } from "@/shared/messages";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { titlePromptFromSegments } from "@/shared/threadTitle";
import { captureThreadPromptSubmitted, captureThreadStarted } from "@/renderer/analytics/posthog";
import { readBridge } from "@/renderer/bridge";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { i18n } from "@/renderer/i18n/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByGroupId } from "@/renderer/state/experimentStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { unprojectProjectLocation } from "@/renderer/remoteProcedureRouter";
import { remoteOwner, remoteThreadId } from "@/renderer/state/remoteProjection";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteThreadLaunchResult } from "@/renderer/state/remoteServers/types";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { buildProjectDraftConfig } from "@/renderer/views/MainView/parts/AppContent/draftConfig";
import {
  createWorktree,
  primeWorktreeGitState,
  runWorktreeSetupScript,
} from "./worktreeLaunchActions";
import { performWorktreeRemoval } from "./worktreeActions";

export async function performInitialThreadLaunch(input: {
  thread: Thread;
  projectLocation: ProjectLocation;
  prompt: string;
  segments?: PromptSegment[];
  userMessageItemId?: string;
  initialSize: TerminalSize;
}): Promise<void> {
  const { thread, projectLocation, prompt, segments, userMessageItemId, initialSize } = input;
  const presentation = thread.presentationMode ?? "terminal";
  if (thread.config.model) {
    useSharedSettings
      .getState()
      .pushRecentModel(
        thread.agentKind,
        thread.config.model,
        presentation,
        thread.config.effort,
        thread.config.fast,
      );
  }

  const optimisticUserMessageItemId =
    userMessageItemId ?? appendOptimisticInitialUserMessage(thread, prompt, segments);
  if (optimisticUserMessageItemId) {
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: thread.canResumeWithConfig,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    });
  }

  if (optimisticUserMessageItemId && !isHomeProjectId(thread.projectId)) {
    await captureFileCheckpoint({
      threadId: thread.id,
      checkpointItemId: optimisticUserMessageItemId,
      projectLocation,
    });
  }

  const sharedSettings = useSharedSettings.getState();
  const projectMcpServers =
    useAppStore.getState().projects.find((project) => project.id === thread.projectId)
      ?.mcpServers ?? [];
  const mcpLaunchSnapshot = resolveMcpLaunchSnapshot(sharedSettings, projectMcpServers);
  useAppStore.getState().setThreadMcpLaunchCustomServerNames(
    thread.id,
    mcpLaunchSnapshot.mcpServers.map((server) => server.name),
  );

  // Local and remote launches share one payload; only the transport differs.
  const startInput = {
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt,
    ...(segments ? { segments } : {}),
    initialSize,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
  };

  // Mirrored remote threads must launch on their host. Spawning locally would
  // apply the remote projectLocation on this machine (posix path →
  // `spawn /bin/bash ENOENT` on Windows) and never reach the remote supervisor.
  const owner = remoteOwner(thread);
  if (owner) {
    // No mcpLaunchSnapshot here: the host ignores client-supplied MCP servers
    // and resolves the launch snapshot from its own settings.
    await useRemoteServersStore.getState().withClient(owner.desktopId, (client) =>
      client.startThread({
        threadId: owner.remoteId,
        projectLocation: unprojectProjectLocation(projectLocation),
        ...startInput,
      }),
    );
  } else {
    await readBridge().startThread({
      threadId: thread.id,
      projectLocation,
      ...startInput,
      ...mcpLaunchSnapshot,
    });
  }
  captureThreadStarted(thread);
  if (prompt.length > 0 || (segments?.length ?? 0) > 0) {
    captureThreadPromptSubmitted(thread, prompt, segments, "initial");
  }
}

interface ThreadLaunchRequest {
  readonly threadId?: string;
  readonly remoteServerId?: string;
  readonly remoteId?: string;
  readonly project: Project;
  readonly agentKind: string;
  readonly config: ThreadConfig;
  readonly prompt: string;
  readonly segments?: PromptSegment[];
  readonly presentationMode?: ThreadPresentationMode;
  readonly worktreePath?: string;
  readonly worktreeBranch?: string;
  readonly worktreeProvisioning?: boolean;
  readonly userMessageItemId?: string;
  readonly isNewWorktree: boolean;
  readonly options: { replacePaneId?: string; preserveActiveGroup?: boolean };
}

interface ThreadLaunchHostTransport {
  readonly setupRunsOnHost: boolean;
  startThread(input: ThreadLaunchRequest): Promise<RemoteThreadLaunchResult>;
}

export async function startThreadFromDraft(
  project: Project,
  input: DraftStartInput,
  options: { replacePaneId?: string; preserveActiveGroup?: boolean } = {},
): Promise<void> {
  const {
    agentKind,
    config,
    prompt,
    segments,
    existingWorktreePath,
    worktreeBranch,
    worktreeBaseBranch,
    worktreeIsNewBranch,
    worktreeTransferUncommitted,
    presentationMode,
  } = input;
  // Everything below runs on the project's host, so a mirrored remote project
  // can't launch while its server is unreachable. Bail before creating a
  // worktree we would then have to unwind.
  if (isRemoteProjectUnreachable(project)) {
    toast.danger(
      i18n._(msg`This project's remote server is offline. Reconnect it to start a thread.`),
    );
    return;
  }

  const isHomeScope = isHomeProject(project);
  const owner = remoteOwner(project);
  const host = threadLaunchHost(project);

  useAppStore.getState().updateProjectDraftConfig(
    project.id,
    buildProjectDraftConfig({
      agentKind,
      config,
      worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
    }),
  );

  let worktreePath = isHomeScope ? undefined : existingWorktreePath;
  let isNewWorktree = false;
  const createsWorktree = !isHomeScope && !worktreePath && !!worktreeBranch;
  const remoteHostThreadId = createsWorktree && owner ? crypto.randomUUID() : undefined;
  const pendingThread = createsWorktree
    ? createThreadRow({
        ...(owner && remoteHostThreadId
          ? {
              threadId: remoteThreadId(owner.desktopId, remoteHostThreadId),
              remoteServerId: owner.desktopId,
              remoteId: remoteHostThreadId,
            }
          : {}),
        project,
        agentKind,
        config,
        prompt,
        ...(segments ? { segments } : {}),
        ...(presentationMode ? { presentationMode } : {}),
        worktreeBranch,
        worktreeProvisioning: true,
        isNewWorktree: true,
        options,
      })
    : undefined;
  const pendingUserMessageItemId = pendingThread
    ? appendOptimisticInitialUserMessage(pendingThread, prompt, segments)
    : undefined;
  if (!isHomeScope && !worktreePath && worktreeBranch) {
    try {
      const transferUncommitted = worktreeTransferUncommitted ?? false;
      const result = await createWorktree(project, {
        branch: worktreeBranch,
        ...(worktreeBaseBranch ? { startPoint: worktreeBaseBranch } : {}),
        createBranch: worktreeIsNewBranch ?? false,
        transferUncommitted,
        keepChangesInSource: transferUncommitted,
      });
      worktreePath = result.path;
      isNewWorktree = true;
      if (worktreeTransferUncommitted && result.changesTransferred === false) {
        toast.danger(
          i18n._(
            msg`Couldn't copy your uncommitted changes into the new worktree — they remain on the current branch.`,
          ),
        );
      }
    } catch (error) {
      console.error("[renderer] failed to create worktree:", error);
      const message = friendlyError(error);
      if (pendingThread) {
        const store = useAppStore.getState();
        store.applyRuntimeEvent(pendingThread.id, {
          type: "error",
          threadId: pendingThread.id,
          message,
        });
        store.updateThreadRuntime(pendingThread.id, {
          status: "error",
          attention: "error",
          errorMessage: message,
          canResumeWithConfig: false,
        });
      }
      toast.danger(message);
      throw error;
    }
  }

  if (pendingThread && worktreePath) {
    const store = useAppStore.getState();
    const currentThread = store.threads.find((thread) => thread.id === pendingThread.id);
    if (!currentThread) {
      await performWorktreeRemoval(project, worktreePath, worktreeBranch);
      return;
    }
    if (currentThread.archived) {
      store.setThreadWorktree(pendingThread.id, worktreePath, worktreeBranch);
      store.updateThreadRuntime(pendingThread.id, {
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
      });
    } else if (owner && remoteHostThreadId) {
      store.setThreadWorktree(pendingThread.id, worktreePath, worktreeBranch, {
        preserveProvisioning: true,
      });
      store.updateThreadRuntime(pendingThread.id, {
        status: "working",
        attention: "working",
        canResumeWithConfig: false,
      });
      try {
        const started = await host.startThread({
          threadId: remoteHostThreadId,
          project,
          agentKind,
          config,
          prompt,
          ...(segments ? { segments } : {}),
          ...(presentationMode ? { presentationMode } : {}),
          worktreePath,
          ...(worktreeBranch ? { worktreeBranch } : {}),
          ...(pendingUserMessageItemId ? { userMessageItemId: pendingUserMessageItemId } : {}),
          isNewWorktree: true,
          options,
        });
        if (started === "cancelled") {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        if (started === "cancellation-failed") return;
      } catch (error) {
        if (!useAppStore.getState().threads.some((thread) => thread.id === pendingThread.id)) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        markThreadLaunchFailed(pendingThread.id, error);
        throw error;
      }
      if (useAppStore.getState().threads.some((thread) => thread.id === pendingThread.id)) {
        useAppStore.getState().setThreadWorktree(pendingThread.id, worktreePath, worktreeBranch);
      }
    } else {
      store.setThreadWorktree(pendingThread.id, worktreePath, worktreeBranch);
      // Launch inline, never via the view-consumed launch queue: a queued
      // launch fires only when a mounted ThreadView consumes it, so switching
      // or closing the pane while the worktree provisions would leave the
      // agent silently never started. The launch must not depend on the view.
      const launchThread =
        useAppStore.getState().threads.find((thread) => thread.id === pendingThread.id) ??
        pendingThread;
      try {
        await performInitialThreadLaunch({
          thread: launchThread,
          projectLocation: resolveProjectLocation(project.location, worktreePath),
          prompt,
          ...(segments ? { segments } : {}),
          ...(pendingUserMessageItemId ? { userMessageItemId: pendingUserMessageItemId } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
        });
      } catch (error) {
        if (!useAppStore.getState().threads.some((thread) => thread.id === pendingThread.id)) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        markThreadLaunchFailed(pendingThread.id, error);
        throw error;
      }
    }
  } else {
    await host.startThread({
      project,
      agentKind,
      config,
      prompt,
      ...(segments ? { segments } : {}),
      ...(presentationMode ? { presentationMode } : {}),
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
      isNewWorktree,
      options,
    });
  }

  if (worktreePath) {
    void primeWorktreeGitState(project, worktreePath);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
  if (isNewWorktree && worktreePath && !host.setupRunsOnHost) {
    const setupScript = project.scripts?.setupScript;
    if (setupScript) {
      void runWorktreeSetupScript(project, worktreePath, setupScript);
    }
  }
}

function threadLaunchHost(project: Project): ThreadLaunchHostTransport {
  const owner = remoteOwner(project);
  if (owner) {
    return {
      setupRunsOnHost: true,
      startThread: async (launch) => {
        const remoteId = launch.threadId;
        return useRemoteServersStore.getState().launchRemoteThread(
          {
            ...(remoteId ? { threadId: remoteId } : {}),
            desktopId: owner.desktopId,
            projectId: owner.remoteId,
            agentKind: launch.agentKind,
            config: launch.config,
            prompt: launch.prompt,
            ...(launch.segments ? { segments: launch.segments } : {}),
            presentationMode: launch.presentationMode ?? "terminal",
            ...(launch.worktreePath ? { worktreePath: launch.worktreePath } : {}),
            ...(launch.worktreeBranch ? { worktreeBranch: launch.worktreeBranch } : {}),
            ...(launch.isNewWorktree ? { isNewWorktree: true } : {}),
            ...(launch.userMessageItemId ? { userMessageItemId: launch.userMessageItemId } : {}),
          },
          remoteId
            ? {
                isPendingLaunchOwned: () =>
                  useAppStore.getState().provisioningWorktreeThreadIds[
                    remoteThreadId(owner.desktopId, remoteId)
                  ] === true,
              }
            : undefined,
        );
      },
    };
  }

  return {
    setupRunsOnHost: false,
    startThread: async (launch) => {
      const thread = createThreadRow(launch);
      // Launch inline, never via the view-consumed launch queue — the launch
      // must not depend on which pane is mounted (see the worktree path above).
      try {
        await performInitialThreadLaunch({
          thread,
          projectLocation: resolveProjectLocation(launch.project.location, launch.worktreePath),
          prompt: launch.prompt,
          ...(launch.segments ? { segments: launch.segments } : {}),
          ...(launch.userMessageItemId ? { userMessageItemId: launch.userMessageItemId } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
        });
      } catch (error) {
        if (useAppStore.getState().threads.some((row) => row.id === thread.id)) {
          markThreadLaunchFailed(thread.id, error);
        }
        throw error;
      }
      return "started";
    },
  };
}

function createThreadRow(launch: ThreadLaunchRequest): Thread {
  const store = useAppStore.getState();
  const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
  const projectAgentStatuses = getProjectAgentStatuses(
    launch.project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const titlePrompt = titlePromptFromSegments(launch.prompt, launch.segments);
  const currentView = store.view;
  const activeGroup =
    launch.options.preserveActiveGroup !== false &&
    currentView.kind === "thread" &&
    currentView.activeGroupId &&
    !findExperimentByGroupId(currentView.activeGroupId)
      ? {
          groupId: currentView.activeGroupId,
          groupName: store.threads.find((thread) => thread.groupId === currentView.activeGroupId)
            ?.groupName,
        }
      : undefined;

  const thread = store.createThread({
    ...(launch.threadId ? { threadId: launch.threadId } : {}),
    projectId: launch.project.id,
    agentKind: launch.agentKind,
    config: launch.config,
    prompt: titlePrompt,
    ...(launch.presentationMode ? { presentationMode: launch.presentationMode } : {}),
    ...(launch.worktreePath ? { worktreePath: launch.worktreePath } : {}),
    ...(launch.worktreeBranch ? { worktreeBranch: launch.worktreeBranch } : {}),
    ...(launch.worktreeProvisioning ? { worktreeProvisioning: true } : {}),
    ...(launch.remoteServerId ? { remoteServerId: launch.remoteServerId } : {}),
    ...(launch.remoteId ? { remoteId: launch.remoteId } : {}),
    ...(launch.options.replacePaneId ? { replacePaneId: launch.options.replacePaneId } : {}),
    ...(activeGroup?.groupId ? { groupId: activeGroup.groupId } : {}),
    ...(activeGroup?.groupName ? { groupName: activeGroup.groupName } : {}),
  });
  if (!launch.remoteServerId) {
    generateTitleAsync(thread.id, launch.project.location, projectAgentStatuses, titlePrompt);
  }
  return thread;
}

/** Surface a failed launch on the thread row (error item + error status). */
function markThreadLaunchFailed(threadId: string, error: unknown): void {
  const store = useAppStore.getState();
  const message = friendlyError(error);
  store.applyRuntimeEvent(threadId, {
    type: "error",
    threadId,
    message,
  });
  store.updateThreadRuntime(threadId, {
    status: "error",
    attention: "error",
    errorMessage: message,
    canResumeWithConfig: false,
  });
}

function appendOptimisticInitialUserMessage(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  const presentation = thread.presentationMode ?? "terminal";
  if (presentation !== "gui" || prompt.length === 0 || thread.sessionRef !== undefined) {
    return undefined;
  }

  const itemId = `user-${crypto.randomUUID()}`;
  useAppStore.getState().applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId,
    itemType: "user_message",
    payload: { content: buildPromptContentBlocks(prompt, segments) },
  });
  useAppStore.getState().applyRuntimeEvent(thread.id, {
    type: "item.completed",
    threadId: thread.id,
    itemId,
  });
  return itemId;
}
