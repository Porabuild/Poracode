import {
  markPendingThreadCreated,
  markPendingThreadCreationUncertain,
  pinThreadRow,
  dropPendingThreadLaunch,
} from "@/renderer/state/threadLaunchIntents";
import { applyHomeScopePermissions } from "@/shared/agents/unrestrictedPermissions";
import type {
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
  TurnClientContext,
} from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { resolveThreadTitlePrompt, titlePromptFromSegments } from "@/shared/threadTitle";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost } from "@/renderer/state/entityHost";
import { reconcileHostThreadLaunch } from "@/renderer/state/hostThreadLaunch";
import {
  readHostAgentStatusPools,
  selectLocationAgentStatuses,
} from "@/renderer/hooks/useHostAgentStatuses";
import { findExperimentByGroupId } from "@/renderer/state/experimentStore";
import { getActiveWorkspaceId } from "@/renderer/state/workspaceStore";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { isRemoteCommandOutcomeUncertainError } from "./threadCommandOutcomeActions";

export interface ThreadLaunchRequest {
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
  readonly clientContext?: TurnClientContext;
  readonly isNewWorktree: boolean;
  readonly options: { replacePaneId?: string; preserveActiveGroup?: boolean };
}

function projectTitleInput(
  project: Project,
  agentKind: string,
  prompt: string,
  segments?: PromptSegment[],
) {
  // The agents the project's own host has, for whichever host owns it.
  const projectAgentStatuses = selectLocationAgentStatuses(
    readHostAgentStatusPools(project.remoteServerId),
    project.location,
  );
  const agentStatus = projectAgentStatuses.find((status) => status.kind === agentKind);
  return {
    agentStatus,
    projectAgentStatuses,
    titlePrompt: resolveThreadTitlePrompt(
      titlePromptFromSegments(prompt, segments),
      agentStatus?.capabilities.threadTitleCommands,
    ),
  };
}

/** Create the visible draft row; it can precede worktree preparation and host persistence. */
export function createDraftThread(launch: ThreadLaunchRequest): Thread {
  const store = useAppStore.getState();
  const { agentStatus, titlePrompt } = projectTitleInput(
    launch.project,
    launch.agentKind,
    launch.prompt,
    launch.segments,
  );
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

  const config =
    isHomeProject(launch.project) && agentStatus
      ? applyHomeScopePermissions(launch.project.location, launch.config, agentStatus.capabilities)
      : launch.config;

  // Home threads stay local to the workspace they were started in; threads in
  // real projects scope through their project's workspaceId instead.
  const homeWorkspaceId = isHomeProject(launch.project) ? getActiveWorkspaceId() : null;
  return store.createThread({
    ...(launch.threadId ? { threadId: launch.threadId } : {}),
    projectId: launch.project.id,
    ...(homeWorkspaceId ? { workspaceId: homeWorkspaceId } : {}),
    agentKind: launch.agentKind,
    config,
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
}

/**
 * Save the row on its host before title generation and worktree preparation
 * can address it, whichever host owns the project.
 */
export async function prepareDraftThread(
  thread: Thread,
  project: Project,
  prompt: string,
  segments?: PromptSegment[],
): Promise<boolean> {
  const host = entityHost(thread);
  if (host) {
    const release = pinThreadRow(thread.id);
    // An authoritative read may install the host row again. Remember local
    // deletion throughout creation so reconciliation cannot undo cancellation.
    let deleted = false;
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        state.threads !== previous.threads &&
        !state.threads.some((row) => row.id === thread.id)
      ) {
        deleted = true;
      }
    });
    try {
      try {
        const parentThreadId = thread.parentThreadId
          ? host.hostThreadId(thread.parentThreadId)
          : undefined;
        await host.sendThreadCommand({
          kind: "create",
          threadId: host.hostId,
          projectId: host.hostProjectId(thread.projectId) ?? thread.projectId,
          title: thread.title,
          agentKind: thread.agentKind,
          ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
          config: thread.config,
          ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
          ...(thread.workspaceId && host.sharesClientWorkspaces
            ? { workspaceId: thread.workspaceId }
            : {}),
          ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
          ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
          ...(thread.groupId ? { groupId: thread.groupId } : {}),
          ...(thread.groupName ? { groupName: thread.groupName } : {}),
          ...(parentThreadId ? { parentThreadId } : {}),
          ...(thread.prNumber ? { prNumber: thread.prNumber } : {}),
        });
        markPendingThreadCreated(thread.id);
      } catch (error) {
        if (!isRemoteCommandOutcomeUncertainError(error)) throw error;
        markPendingThreadCreationUncertain(thread.id);
        // Read once without resending creation. Even an unavailable read must
        // retain host-owned deletion: the row may already have committed.
        const existence = await reconcileHostThreadLaunch(host, thread.id);
        if (existence === "present") markPendingThreadCreated(thread.id);
        if (!deleted) throw error;
      }
      if (deleted) {
        await host.sendThreadCommand({ kind: "delete", threadId: host.hostId });
        dropPendingThreadLaunch(thread.id);
        useAppStore.getState().deleteThread(thread.id);
        return false;
      }
    } finally {
      unsubscribe();
      release();
    }
  }
  const { projectAgentStatuses, titlePrompt } = projectTitleInput(
    project,
    thread.agentKind,
    prompt,
    segments,
  );
  if (titlePrompt.trim()) {
    generateTitleAsync(
      thread.id,
      project.location,
      projectAgentStatuses,
      titlePrompt,
      thread.title,
    );
  }
  return true;
}
