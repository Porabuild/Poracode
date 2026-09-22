import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { applyHomeScopePermissions } from "@/shared/agents/unrestrictedPermissions";
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
import { resolveThreadTitlePrompt, titlePromptFromSegments } from "@/shared/threadTitle";
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
import {
  downgradeProjectedThreadMentionSegments,
  remoteOwner,
  remoteThreadId,
  unprojectRemoteThreadMentionSegments,
} from "@/renderer/state/remoteProjection";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import {
  isManagedRootDesktopRuntime,
  startManagedRootThread,
} from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  consumePendingManagedRootLaunch,
  dropPendingManagedRootLaunch,
  notePendingManagedRootLaunch,
  peekPendingManagedRootLaunch,
  retainPendingManagedRootLaunch,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { managedRootSupportsThreadLaunchMetadata } from "@/renderer/state/managedRootCatalog/rootLaunchMetadataCapability";
import { reconcileManagedRootThreadLaunch } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import {
  dispatchManagedRootProjectDraftConfig,
  dispatchManagedRootThreadWorkspace,
} from "@/renderer/state/managedRootCatalog/rootCatalogIntents";
import type { PendingLaunchProviderSwitch } from "@/renderer/state/slices/launchSlice";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteThreadLaunchResult } from "@/renderer/state/remoteServers/types";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { getActiveWorkspaceId } from "@/renderer/state/workspaceStore";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { buildProjectDraftConfig } from "@/renderer/views/MainView/parts/AppContent/draftConfig";
import {
  isRemoteCommandOutcomeAuthoritativelyResolved,
  isRemoteCommandOutcomeUncertainError,
  notifyThreadCommandOutcomeUncertain,
  reconcileRemoteThreadCommandOutcome,
  reconcileThreadCommandOutcome,
} from "./threadCommandOutcomeActions";
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
  providerSwitch?: PendingLaunchProviderSwitch;
  mentionHandoff?: true;
  initialSize: TerminalSize;
}): Promise<void> {
  const { thread, projectLocation, prompt, segments, userMessageItemId, initialSize } = input;
  const providerSwitch = input.providerSwitch;
  // A switched thread starts a brand-new session under the new provider; the
  // previous provider's ref must not reach either the optimistic state or launch.
  const resumableSessionRef = providerSwitch ? undefined : thread.sessionRef;
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

  // An uncertain-retry replay reuses the operation's original optimistic item
  // id instead of painting a second local copy of the same user message.
  const retainedReplay =
    !providerSwitch && !resumableSessionRef && !remoteOwner(thread) && isManagedRootDesktopRuntime()
      ? peekPendingManagedRootLaunch(thread.id)
      : undefined;
  const optimisticUserMessageItemId =
    userMessageItemId ??
    (providerSwitch
      ? allocateInitialUserMessageItemId(thread, prompt)
      : (retainedReplay?.replay?.userMessageItemId ??
        appendOptimisticInitialUserMessage(thread, prompt, segments)));
  if (optimisticUserMessageItemId && !providerSwitch) {
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: thread.canResumeWithConfig,
      ...(resumableSessionRef ? { sessionRef: resumableSessionRef } : {}),
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
    ...(resumableSessionRef ? { sessionRef: resumableSessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
    ...(providerSwitch ? { providerSwitch } : {}),
    ...(input.mentionHandoff ? { mentionHandoff: true as const } : {}),
  };

  // Mirrored remote threads must launch on their host. Spawning locally would
  // apply the remote projectLocation on this machine (posix path →
  // `spawn /bin/bash ENOENT` on Windows) and never reach the remote supervisor.
  const owner = remoteOwner(thread);
  // A root row the renderer has not asked the host to create yet is created
  // and launched by ONE explicit host `start` command, so the durable row and
  // the session are born together (the supervisor IPC path can only resume a
  // row the host already knows). A resume/switch keeps the supervisor path.
  const pendingRootLaunch =
    !owner && !providerSwitch && !resumableSessionRef && isManagedRootDesktopRuntime()
      ? consumePendingManagedRootLaunch(thread.id)
      : undefined;
  try {
    if (pendingRootLaunch) {
      // An uncertain retry reuses the retained body VERBATIM; a new episode
      // derives it once from the thread and the launch inputs. The metadata
      // fields are capability-gated: an unadvertised host would strip them and
      // answer success, so they are omitted rather than falsely claimed.
      let launchInput = pendingRootLaunch.replay;
      if (!launchInput) {
        const supportsLaunchMetadata = await managedRootSupportsThreadLaunchMetadata();
        launchInput = {
          threadId: thread.id,
          projectId: thread.projectId,
          agentKind: thread.agentKind,
          ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
          config: thread.config,
          prompt,
          ...(segments ? { segments } : {}),
          ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
          ...(optimisticUserMessageItemId
            ? { userMessageItemId: optimisticUserMessageItemId }
            : {}),
          ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
          ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
          ...(pendingRootLaunch.isNewWorktree ? { isNewWorktree: true } : {}),
          ...(thread.groupId ? { groupId: thread.groupId } : {}),
          ...(thread.groupName ? { groupName: thread.groupName } : {}),
          // An explicit title (fork/handoff inherit the source's) is
          // authoritative host-side; without it the host derives a new one.
          ...(thread.title ? { title: thread.title } : {}),
          ...(supportsLaunchMetadata
            ? {
                ...(thread.workspaceId ? { workspaceId: thread.workspaceId } : {}),
                initialSize,
                ...(thread.parentThreadId ? { parentThreadId: thread.parentThreadId } : {}),
                ...(thread.prNumber ? { prNumber: thread.prNumber } : {}),
              }
            : {}),
        };
      }
      // The exact operation is retained BEFORE it is sent, so an uncertain
      // outcome (which may already have started the provider) keeps the same
      // id and body for an explicit retry; the host receipt then replays or
      // refuses that exact operation instead of running a second launch.
      retainPendingManagedRootLaunch(thread.id, {
        isNewWorktree: pendingRootLaunch.isNewWorktree,
        commandId: pendingRootLaunch.commandId,
        replay: launchInput,
      });
      try {
        await startManagedRootThread(launchInput, { commandId: pendingRootLaunch.commandId });
      } catch (error) {
        // The operation is retired ONLY when the host authoritatively resolved
        // it as a definite failure for this same command id (a recorded
        // `failed` receipt, answered as `command_failed`) or when this was a
        // first-ever attempt whose failure is classified definite (proven
        // pre-effect) — only then is a fresh operation genuinely new work.
        // While an uncertain episode exists, a locally raised error (e.g. the
        // loopback leg being down) or a generic 404/403 says nothing about the
        // earlier external effect, so the exact id and body stay retained.
        const hadUncertainEpisode = pendingRootLaunch.replay !== undefined;
        if (
          !isRemoteCommandOutcomeUncertainError(error) &&
          (!hadUncertainEpisode || isRemoteCommandOutcomeAuthoritativelyResolved(error))
        ) {
          notePendingManagedRootLaunch(thread.id, pendingRootLaunch.isNewWorktree);
        }
        throw error;
      }
      // The operation completed (or its recorded outcome replayed): the row is
      // host-owned now, so the create+launch intent is retired and a later
      // message on this thread is an ordinary send, never a relaunch.
      dropPendingManagedRootLaunch(thread.id);
      // Workspace assignment is a follow-up narrow command only when the start
      // body could not carry it (an unadvertised capability); Home threads keep
      // the workspace they were started in instead of becoming unfiled.
      if (thread.workspaceId && launchInput.workspaceId === undefined) {
        dispatchManagedRootThreadWorkspace(thread.id, thread.workspaceId);
      }
    } else if (owner) {
      // No mcpLaunchSnapshot here: the host ignores client-supplied MCP servers
      // and resolves the launch snapshot from its own settings.
      await useRemoteServersStore.getState().withClient(owner.desktopId, (client) =>
        client.startThread({
          threadId: owner.remoteId,
          projectLocation: unprojectProjectLocation(projectLocation),
          ...startInput,
          ...(!prompt && !segments?.length && !providerSwitch && !optimisticUserMessageItemId
            ? { ensureRunning: true as const }
            : {}),
          ...(startInput.segments
            ? {
                segments: unprojectRemoteThreadMentionSegments(
                  owner.desktopId,
                  startInput.segments,
                  useAppStore.getState().threads,
                ),
              }
            : {}),
        }),
      );
    } else {
      await readBridge().startThread({
        threadId: thread.id,
        projectLocation,
        ...startInput,
        ...(startInput.segments
          ? { segments: downgradeProjectedThreadMentionSegments(startInput.segments) }
          : {}),
        ...mcpLaunchSnapshot,
      });
    }
  } catch (error) {
    // The host may have started the session without being able to confirm it.
    // Keep the optimistic launch state, explain the uncertainty, and run one
    // bounded authoritative read — never a resend. The error still propagates
    // so launch catches do not paint a definite failure.
    if (isRemoteCommandOutcomeUncertainError(error)) {
      notifyThreadCommandOutcomeUncertain();
      if (pendingRootLaunch) {
        // The same operation id and exact original body stay retained for an
        // explicit retry. The bounded read is evidence/row convergence only:
        // absence is never used to mint a fresh identity because the provider
        // may already have received the prompt before the failure.
        await reconcileManagedRootThreadLaunch(thread.id);
      } else {
        await reconcileThreadCommandOutcome(thread);
      }
    }
    throw error;
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

  const nextDraftConfig = buildProjectDraftConfig({
    agentKind,
    config,
    worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
  });
  useAppStore.getState().updateProjectDraftConfig(project.id, nextDraftConfig);
  dispatchManagedRootProjectDraftConfig(project.id, nextDraftConfig);

  let worktreePath = isHomeScope ? undefined : existingWorktreePath;
  let isNewWorktree = false;
  const createsWorktree = !isHomeScope && !worktreePath && !!worktreeBranch;
  const remoteHostThreadId = createsWorktree && owner ? crypto.randomUUID() : undefined;
  const pendingThread = createsWorktree
    ? createThreadRow({
        ...(input.threadId && !owner ? { threadId: input.threadId } : {}),
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
        // Uncertain: the launch may have committed. The launch action already
        // reconciled once and explained it; never paint a definite failure or
        // unwind the worktree the session may be running in.
        if (isRemoteCommandOutcomeUncertainError(error)) throw error;
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
        // Uncertain: the launch may have committed — keep the optimistic row
        // and the worktree; the launch action already reconciled once.
        if (isRemoteCommandOutcomeUncertainError(error)) throw error;
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
      ...(input.threadId && !owner ? { threadId: input.threadId } : {}),
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
        // Allocate the host thread id here, not inside `launchRemoteThread`:
        // an uncertain start still needs the id to read back authoritatively.
        // Only a caller-supplied id (the provisioning-worktree launch) carries
        // the abandonment check; a fresh draft launch keeps the existing
        // no-compensation behavior.
        const remoteId = launch.threadId ?? crypto.randomUUID();
        const launchOptions = launch.threadId
          ? {
              isPendingLaunchOwned: () =>
                useAppStore.getState().provisioningWorktreeThreadIds[
                  remoteThreadId(owner.desktopId, remoteId)
                ] === true,
            }
          : undefined;
        try {
          return await useRemoteServersStore.getState().launchRemoteThread(
            {
              threadId: remoteId,
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
            launchOptions,
          );
        } catch (error) {
          // The host may have started the session without confirming it: keep
          // the optimistic row, explain the uncertainty, and read the
          // client-chosen thread id back once — never resend.
          if (isRemoteCommandOutcomeUncertainError(error)) {
            notifyThreadCommandOutcomeUncertain();
            await reconcileRemoteThreadCommandOutcome(owner.desktopId, remoteId);
          }
          throw error;
        }
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
        // Uncertain: the launch may have committed — the launch action already
        // reconciled once; keep the optimistic row instead of an error status.
        if (isRemoteCommandOutcomeUncertainError(error)) throw error;
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

  const agentStatus = projectAgentStatuses.find((status) => status.kind === launch.agentKind);
  const titlePrompt = resolveThreadTitlePrompt(
    titlePromptFromSegments(launch.prompt, launch.segments),
    agentStatus?.capabilities.threadTitleCommands,
  );
  const config =
    isHomeProject(launch.project) && agentStatus
      ? applyHomeScopePermissions(launch.project.location, launch.config, agentStatus.capabilities)
      : launch.config;

  // Home threads stay local to the workspace they were started in; threads in
  // real projects scope through their project's workspaceId instead.
  const homeWorkspaceId = isHomeProject(launch.project) ? getActiveWorkspaceId() : null;
  const thread = store.createThread({
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
  if (!launch.remoteServerId && titlePrompt.trim()) {
    generateTitleAsync(thread.id, launch.project.location, projectAgentStatuses, titlePrompt);
  }
  return thread;
}

/** Surface a failed launch on the thread row (error item + error status). */
function markThreadLaunchFailed(threadId: string, error: unknown): void {
  const store = useAppStore.getState();
  // The pending create+launch intent survives every failure: a definite
  // pre-effect failure was already re-armed as a fresh attempt by the launch
  // path, and an uncertain outcome keeps the SAME operation id and exact body
  // for an explicit retry. Only an authoritative removal drops the intent.
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

/**
 * Paint the user's first message for a launch that has not reached the
 * supervisor yet, so the chat shows what was sent instead of a bare working
 * row. The supervisor reuses the returned id for its own canonical
 * `user_message`, and the store's per-id dedupe drops the duplicate.
 */
export function appendOptimisticInitialUserMessage(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  const itemId = allocateInitialUserMessageItemId(thread, prompt);
  if (!itemId) return undefined;

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

function allocateInitialUserMessageItemId(thread: Thread, prompt: string): string | undefined {
  const presentation = thread.presentationMode ?? "terminal";
  if (presentation !== "gui" || prompt.length === 0 || thread.sessionRef !== undefined) {
    return undefined;
  }
  return `user-${crypto.randomUUID()}`;
}
