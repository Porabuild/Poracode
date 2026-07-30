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
import { resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
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
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { buildProjectDraftConfig } from "@/renderer/views/MainView/parts/AppContent/draftConfig";
import { worktreePlacementPayload } from "./worktreePlacement";
import { primeWorktreeGitState, runWorktreeSetupScript } from "./worktreeLaunchActions";

export async function performInitialThreadLaunch(input: {
  thread: Thread;
  projectLocation: ProjectLocation;
  prompt: string;
  segments?: PromptSegment[];
  initialSize: TerminalSize;
}): Promise<void> {
  const { thread, projectLocation, prompt, segments, initialSize } = input;
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

  let optimisticUserMessageItemId: string | undefined;
  if (presentation === "gui" && prompt.length > 0 && thread.sessionRef === undefined) {
    optimisticUserMessageItemId = `user-${crypto.randomUUID()}`;
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
    });
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
  await readBridge().startThread({
    threadId: thread.id,
    projectLocation,
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt,
    ...(segments ? { segments } : {}),
    initialSize,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...mcpLaunchSnapshot,
    ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
  });
  captureThreadStarted(thread);
  if (prompt.length > 0 || (segments?.length ?? 0) > 0) {
    captureThreadPromptSubmitted(thread, prompt, segments, "initial");
  }
}

interface ThreadLaunchHostTransport {
  readonly setupRunsOnHost: boolean;
  startThread(input: {
    readonly project: Project;
    readonly agentKind: string;
    readonly config: ThreadConfig;
    readonly prompt: string;
    readonly segments?: PromptSegment[];
    readonly presentationMode?: ThreadPresentationMode;
    readonly worktreePath?: string;
    readonly worktreeBranch?: string;
    readonly isNewWorktree: boolean;
    readonly options: { replacePaneId?: string; preserveActiveGroup?: boolean };
  }): Promise<void>;
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
  const isHomeScope = isHomeProject(project);
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
  if (!isHomeScope && !worktreePath && worktreeBranch) {
    try {
      const transferUncommitted = worktreeTransferUncommitted ?? false;
      const result = await readBridge().gitAddWorktree({
        projectLocation: project.location,
        branch: worktreeBranch,
        ...(worktreeBaseBranch ? { startPoint: worktreeBaseBranch } : {}),
        createBranch: worktreeIsNewBranch ?? false,
        ...(!project.remoteServerId ? worktreePlacementPayload(project) : {}),
        copyIgnoredPatterns: project.scripts?.worktreeCopyPatterns,
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
      toast.danger(friendlyError(error));
      throw error;
    }
  }

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
  const desktopId = project.remoteServerId;
  const remoteProjectId = project.remoteId;
  if (desktopId && remoteProjectId) {
    const remoteServer = useRemoteServersStore
      .getState()
      .servers.find((server) => server.desktopId === desktopId);
    const helperHost =
      remoteServer?.hostMode === "helper" ||
      (remoteServer?.hostMode === undefined && remoteServer?.transport?.kind === "ssh");
    return {
      setupRunsOnHost: !helperHost,
      startThread: async (launch) => {
        await useRemoteServersStore.getState().launchRemoteThread({
          desktopId,
          projectId: remoteProjectId,
          agentKind: launch.agentKind,
          config: launch.config,
          prompt: launch.prompt,
          ...(launch.segments ? { segments: launch.segments } : {}),
          presentationMode: launch.presentationMode ?? "terminal",
          ...(launch.worktreePath ? { worktreePath: launch.worktreePath } : {}),
          ...(launch.worktreeBranch ? { worktreeBranch: launch.worktreeBranch } : {}),
          ...(launch.isNewWorktree ? { isNewWorktree: true } : {}),
        });
      },
    };
  }

  return {
    setupRunsOnHost: false,
    startThread: (launch) => {
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
              groupName: store.threads.find(
                (thread) => thread.groupId === currentView.activeGroupId,
              )?.groupName,
            }
          : undefined;

      const thread = store.createThread({
        projectId: launch.project.id,
        agentKind: launch.agentKind,
        config: launch.config,
        prompt: titlePrompt,
        ...(launch.presentationMode ? { presentationMode: launch.presentationMode } : {}),
        ...(launch.worktreePath
          ? {
              worktreePath: launch.worktreePath,
              ...(launch.worktreeBranch ? { worktreeBranch: launch.worktreeBranch } : {}),
            }
          : {}),
        ...(launch.options.replacePaneId ? { replacePaneId: launch.options.replacePaneId } : {}),
        ...(activeGroup?.groupId ? { groupId: activeGroup.groupId } : {}),
        ...(activeGroup?.groupName ? { groupName: activeGroup.groupName } : {}),
      });
      store.queueThreadLaunch(thread.id, launch.prompt, launch.segments);
      generateTitleAsync(thread.id, launch.project.location, projectAgentStatuses, titlePrompt);
      return Promise.resolve();
    },
  };
}
