import {
  dropPendingThreadLaunch,
  notePendingThreadLaunch,
  peekPendingThreadLaunch,
  retainPendingThreadLaunch,
  markPendingThreadCreated,
} from "@/renderer/state/threadLaunchIntents";
import { withThreadConfigSubmission } from "./threadConfigSubmission";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type {
  Project,
  ProjectLocation,
  PromptSegment,
  QuestionAnswerItemPayload,
  TerminalSize,
  Thread,
  TurnClientContext,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { resolveProjectLocation } from "@/shared/worktree";
import { friendlyError } from "@/shared/messages";
import { buildPromptContentBlocks, hasSendablePromptContent } from "@/shared/promptContent";
import { captureThreadPromptSubmitted, captureThreadStarted } from "@/renderer/analytics/posthog";
import { readBridge } from "@/renderer/bridge";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import {
  notePendingThreadInputMessage,
  retainPendingThreadInput,
} from "@/renderer/state/pendingThreadInput";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { unprojectProjectLocation } from "@/renderer/remoteProcedureRouter";
import { downgradeProjectedThreadMentionSegments } from "@/renderer/state/remoteProjection";
import { entityHost } from "@/renderer/state/entityHost";
import { hostSupportsLaunchMetadata, startHostThread } from "@/renderer/state/hostThreadLaunch";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import {
  dispatchProjectDraftConfig,
  dispatchManagedRootThreadWorkspace,
} from "@/renderer/state/managedRootCatalog/rootCatalogIntents";
import type { PendingLaunchProviderSwitch } from "@/renderer/state/slices/launchSlice";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { threadCrewBinding } from "@/shared/crew";
import { buildProjectDraftConfig } from "@/renderer/views/MainView/parts/AppContent/draftConfig";
import {
  isRemoteCommandOutcomeAuthoritativelyResolved,
  isRemoteCommandOutcomeUncertainError,
  notifyThreadCommandOutcomeUncertain,
  reconcileThreadCommandOutcome,
} from "./threadCommandOutcomeActions";
import { createWorktree, primeWorktreeGitState } from "./worktreeLaunchActions";
import { initializeCreatedWorktree } from "./worktreeInitialization";
import { performWorktreeRemoval } from "./worktreeActions";
import { setThreadWorktree } from "./threadActions";
import {
  createDraftThread,
  prepareDraftThread,
  type ThreadLaunchRequest,
} from "./threadDraftCreation";

export async function performInitialThreadLaunch(input: {
  thread: Thread;
  projectLocation: ProjectLocation;
  prompt: string;
  segments?: PromptSegment[];
  userMessageItemId?: string;
  questionAnswer?: QuestionAnswerItemPayload;
  providerSwitch?: PendingLaunchProviderSwitch;
  mentionHandoff?: true;
  /** Per-turn context for the initial prompt (never painted or persisted). */
  clientContext?: TurnClientContext;
  initialSize: TerminalSize;
}): Promise<void> {
  const releasePendingInput =
    input.thread.presentationMode === "gui" &&
    hasSendablePromptContent(input.prompt, input.segments)
      ? retainPendingThreadInput(input.thread.id)
      : undefined;
  try {
    await performInitialThreadLaunchPending(input, releasePendingInput);
  } catch (error) {
    releasePendingInput?.();
    throw error;
  }
}

async function performInitialThreadLaunchPending(
  input: Parameters<typeof performInitialThreadLaunch>[0],
  releasePendingInput: (() => void) | undefined,
): Promise<void> {
  const { thread, projectLocation, prompt, segments, userMessageItemId, initialSize } = input;
  const clientContext = input.clientContext;
  const providerSwitch = input.providerSwitch;
  // A switched thread starts a brand-new session under the new provider; the
  // previous provider's ref must not reach either the optimistic state or launch.
  const resumableSessionRef = providerSwitch ? undefined : thread.sessionRef;
  const presentation = thread.presentationMode ?? "terminal";
  const crewId = threadCrewBinding(thread.config)?.crewId;
  if (thread.config.model) {
    useSharedSettings
      .getState()
      .pushRecentModel(
        thread.agentKind,
        thread.config.model,
        presentation,
        thread.config.effort,
        thread.config.fast,
        crewId,
      );
  }

  // An uncertain-retry replay reuses the operation's original optimistic item
  // id instead of painting a second local copy of the same user message.
  // Every thread launches on its own host. Spawning elsewhere would apply that
  // host's projectLocation on this machine (posix path → `spawn /bin/bash
  // ENOENT` on Windows) and never reach the owning supervisor.
  const host = entityHost(thread);
  const retainedReplay =
    host && !providerSwitch && !resumableSessionRef
      ? peekPendingThreadLaunch(thread.id)
      : undefined;
  const optimisticUserMessageItemId =
    userMessageItemId ??
    (providerSwitch
      ? allocateInitialUserMessageItemId(thread, prompt, segments)
      : (retainedReplay?.replay?.userMessageItemId ??
        appendOptimisticInitialUserMessage(thread, prompt, segments)));
  if (optimisticUserMessageItemId)
    notePendingThreadInputMessage(thread.id, optimisticUserMessageItemId);
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
  const launchProject = useAppStore
    .getState()
    .projects.find((project) => project.id === thread.projectId);
  const mcpLaunchSnapshot = resolveMcpLaunchSnapshot(
    sharedSettings,
    launchProject,
    thread.config.mcpServerOverrides,
  );
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
    ...(input.questionAnswer ? { questionAnswer: input.questionAnswer } : {}),
    ...(providerSwitch ? { providerSwitch } : {}),
    ...(input.mentionHandoff ? { mentionHandoff: true as const } : {}),
    ...(clientContext ? { clientContext } : {}),
  };

  // A new row's first launch retains its receipt and cancellation intent.
  // Acknowledged draft metadata uses the existing-thread endpoint; other
  // creators use the host's create+launch command. Resumes and switches follow
  // the existing runtime path.
  const pendingRootLaunch =
    host && !providerSwitch && !resumableSessionRef
      ? peekPendingThreadLaunch(thread.id)
      : undefined;
  try {
    if (pendingRootLaunch?.removal && (await pendingRootLaunch.removal)) return;
    if (pendingRootLaunch && host) {
      // An uncertain retry reuses the retained body VERBATIM; a new episode
      // derives it once from the thread and the launch inputs. The metadata
      // fields are capability-gated: an unadvertised host would strip them and
      // answer success, so they are omitted rather than falsely claimed.
      let launchInput = pendingRootLaunch.replay;
      if (!launchInput) {
        const supportsLaunchMetadata =
          pendingRootLaunch.metadataCreated === true || (await hostSupportsLaunchMetadata(host));
        const parentThreadId = thread.parentThreadId
          ? host.hostThreadId(thread.parentThreadId)
          : undefined;
        launchInput = {
          threadId: host.hostId,
          ...(pendingRootLaunch.metadataCreated
            ? { projectLocation: unprojectProjectLocation(projectLocation) }
            : {}),
          projectId: host.hostProjectId(thread.projectId) ?? thread.projectId,
          agentKind: thread.agentKind,
          ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
          config: thread.config,
          prompt,
          ...(segments ? { segments: host.toHostSegments(segments) } : {}),
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
          ...(clientContext ? { clientContext } : {}),
          ...(supportsLaunchMetadata
            ? {
                ...(thread.workspaceId && host.sharesClientWorkspaces
                  ? { workspaceId: thread.workspaceId }
                  : {}),
                initialSize,
                ...(parentThreadId ? { parentThreadId } : {}),
                ...(thread.prNumber ? { prNumber: thread.prNumber } : {}),
              }
            : {}),
        };
      }
      // The exact operation is retained BEFORE it is sent, so an uncertain
      // outcome (which may already have started the provider) keeps the same
      // id and body for an explicit retry; the host receipt then replays or
      // refuses that exact operation instead of running a second launch.
      retainPendingThreadLaunch(thread.id, {
        isNewWorktree: pendingRootLaunch.isNewWorktree,
        commandId: pendingRootLaunch.commandId,
        ...(pendingRootLaunch.metadataCreated ? { metadataCreated: true } : {}),
        replay: launchInput,
      });
      try {
        const captured = launchInput;
        await withThreadConfigSubmission(
          thread.id,
          captured.config,
          () => startHostThread(host, captured, { commandId: pendingRootLaunch.commandId }),
          (error) =>
            !isRemoteCommandOutcomeUncertainError(error) &&
            (pendingRootLaunch.replay === undefined ||
              isRemoteCommandOutcomeAuthoritativelyResolved(error)),
        );
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
          notePendingThreadLaunch(thread.id, pendingRootLaunch.isNewWorktree);
          if (pendingRootLaunch.metadataCreated) markPendingThreadCreated(thread.id);
        }
        throw error;
      }
      // The operation completed (or its recorded outcome replayed): the row is
      // host-owned now, so the create+launch intent is retired and a later
      // message on this thread is an ordinary send, never a relaunch.
      // Deletion can begin while provider startup awaits acknowledgement.
      // Join that cancellation before retiring its marker so the creator can
      // remove the completed worktree after confirmed host deletion.
      const removal = peekPendingThreadLaunch(thread.id)?.removal;
      if (removal && (await removal)) return;
      dropPendingThreadLaunch(thread.id);
      // Workspace assignment is a follow-up narrow command only when the start
      // body could not carry it (an unadvertised capability); Home threads keep
      // the workspace they were started in instead of becoming unfiled.
      if (
        !pendingRootLaunch.metadataCreated &&
        host.sharesClientWorkspaces &&
        thread.workspaceId &&
        launchInput.workspaceId === undefined
      ) {
        dispatchManagedRootThreadWorkspace(thread.id, thread.workspaceId);
      }
    } else if (host && !findExperimentByThreadId(thread.id)) {
      // The thread's host starts it through its host contract, whichever host
      // that is: the host resolves the MCP launch snapshot from its own
      // settings, and an empty relaunch only asks it to keep the thread
      // running (another client may already have brought it back). An
      // experiment candidate is started only by the experiment's executing
      // client, over the receipt-guarded procedure route below; the host
      // contract's thread start refuses candidates by design.
      const isEmptyRelaunch =
        !prompt && !segments?.length && !providerSwitch && !optimisticUserMessageItemId;
      await withThreadConfigSubmission(thread.id, startInput.config, () =>
        host.withClient((client) =>
          client.startThread({
            threadId: host.hostId,
            projectLocation: unprojectProjectLocation(projectLocation),
            ...startInput,
            ...(isEmptyRelaunch ? { ensureRunning: true as const } : {}),
            ...(startInput.segments ? { segments: host.toHostSegments(startInput.segments) } : {}),
          }),
        ),
      );
    } else {
      // An experiment candidate, or a row no host owns (a client runtime
      // without a host connection): start it through the bridge's
      // receipt-guarded procedure route.
      const isEmptyReconnect =
        !prompt &&
        !segments?.length &&
        !providerSwitch &&
        !optimisticUserMessageItemId &&
        (resumableSessionRef !== undefined ||
          (presentation === "gui" && thread.canResumeWithConfig));
      const bridge = readBridge();
      const payload = {
        threadId: thread.id,
        projectLocation,
        ...startInput,
        ...(startInput.segments
          ? { segments: downgradeProjectedThreadMentionSegments(startInput.segments) }
          : {}),
        ...mcpLaunchSnapshot,
      };
      await withThreadConfigSubmission(thread.id, startInput.config, () =>
        isEmptyReconnect ? bridge.ensureThreadRunning(payload) : bridge.startThread(payload),
      );
    }
  } catch (error) {
    // The host may have started the session without being able to confirm it.
    // Keep the optimistic launch state, explain the uncertainty, and run one
    // bounded authoritative read — never a resend. The error still propagates
    // so launch catches do not paint a definite failure.
    if (isRemoteCommandOutcomeUncertainError(error)) {
      releasePendingInput?.();
      notifyThreadCommandOutcomeUncertain();
      // A retained launch keeps its operation id and exact original body for
      // an explicit retry. The bounded read is evidence/row convergence only:
      // absence is never used to mint a fresh identity because the provider
      // may already have received the prompt before the failure.
      await reconcileThreadCommandOutcome(thread);
    }
    throw error;
  }
  if (useAppStore.getState().provisioningWorktreeThreadIds?.[thread.id]) {
    useAppStore.getState().finishWorktreeProvisioning(thread.id);
  }
  captureThreadStarted(thread);
  if (prompt.length > 0 || (segments?.length ?? 0) > 0) {
    captureThreadPromptSubmitted(thread, prompt, segments, "initial");
  }
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
    clientContext,
  } = input;
  // Everything below runs on the project's host, so a mirrored remote project
  // can't launch while its server is unreachable. Bail before creating a
  // worktree we would then have to unwind.
  if (isRemoteProjectUnreachable(project)) {
    const message = i18n._(
      msg`This project's remote server is offline. Reconnect it to start a thread.`,
    );
    toast.danger(message);
    throw new Error(message);
  }

  const isHomeScope = isHomeProject(project);
  // The new row's identity on the project's host (a paired host's rows carry
  // projected ids). A project no host owns keeps the client-chosen id.
  const projectHost = entityHost(project);
  const rowIdentity = projectHost
    ? projectHost.projectThreadRow(input.threadId ?? crypto.randomUUID())
    : input.threadId
      ? { threadId: input.threadId }
      : {};

  const nextDraftConfig = buildProjectDraftConfig({
    agentKind,
    config,
    worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
  });
  useAppStore.getState().updateProjectDraftConfig(project.id, nextDraftConfig);
  dispatchProjectDraftConfig(project.id, nextDraftConfig);

  let worktreePath = isHomeScope ? undefined : existingWorktreePath;
  let isNewWorktree = false;
  const createsWorktree = !isHomeScope && !worktreePath && !!worktreeBranch;
  const pendingThread = createsWorktree
    ? createDraftThread({
        ...rowIdentity,
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
  if (pendingThread) {
    try {
      if (!(await prepareDraftThread(pendingThread, project, prompt, segments))) return;
    } catch (error) {
      markThreadLaunchFailed(pendingThread.id, error);
      toast.danger(friendlyError(error));
      throw error;
    }
  }
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
    const preparationRemoval = peekPendingThreadLaunch(pendingThread.id)?.removal;
    if (preparationRemoval && (await preparationRemoval)) {
      await performWorktreeRemoval(project, worktreePath, worktreeBranch);
      return;
    }
    const currentThread = store.threads.find((thread) => thread.id === pendingThread.id);
    if (!currentThread) {
      await performWorktreeRemoval(project, worktreePath, worktreeBranch);
      return;
    }
    {
      // Launch inline, never via the view-consumed launch queue: a queued
      // launch fires only when a mounted ThreadView consumes it, so switching
      // or closing the pane while the worktree provisions would leave the
      // agent silently never started. The launch must not depend on the view.
      try {
        await setThreadWorktree(pendingThread.id, worktreePath, worktreeBranch, {
          preserveProvisioning: true,
        });
        const removal = peekPendingThreadLaunch(pendingThread.id)?.removal;
        if (removal && (await removal)) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        const launchThread = useAppStore
          .getState()
          .threads.find((thread) => thread.id === pendingThread.id);
        if (!launchThread) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        if (launchThread.archived) {
          useAppStore.getState().finishWorktreeProvisioning(pendingThread.id);
          useAppStore.getState().updateThreadRuntime(pendingThread.id, {
            status: "inactive",
            attention: "none",
            canResumeWithConfig: false,
          });
          return;
        }
        await performInitialThreadLaunch({
          thread: launchThread,
          projectLocation: resolveProjectLocation(project.location, worktreePath),
          prompt,
          ...(segments ? { segments } : {}),
          ...(pendingUserMessageItemId ? { userMessageItemId: pendingUserMessageItemId } : {}),
          ...(clientContext ? { clientContext } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
        });
        if (!useAppStore.getState().threads.some((row) => row.id === pendingThread.id)) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
      } catch (error) {
        // Uncertain: the launch may have committed — keep the optimistic row
        // and the worktree; the launch action already reconciled once.
        if (isRemoteCommandOutcomeUncertainError(error)) throw error;
        const removal = peekPendingThreadLaunch(pendingThread.id)?.removal;
        if (
          (removal && (await removal)) ||
          !useAppStore.getState().threads.some((thread) => thread.id === pendingThread.id)
        ) {
          await performWorktreeRemoval(project, worktreePath, worktreeBranch);
          return;
        }
        markThreadLaunchFailed(pendingThread.id, error);
        throw error;
      }
    }
  } else {
    await launchDraftThread({
      ...rowIdentity,
      project,
      agentKind,
      config,
      prompt,
      ...(segments ? { segments } : {}),
      ...(presentationMode ? { presentationMode } : {}),
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
      ...(clientContext ? { clientContext } : {}),
      isNewWorktree,
      options,
    });
  }

  if (worktreePath) {
    if (isNewWorktree) initializeCreatedWorktree(project, worktreePath);
    else void primeWorktreeGitState(project, worktreePath);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
}

/**
 * Creates a draft's thread row and launches it on the project's host, whichever
 * host that is: the first prompt paints before host persistence, the row is
 * created on the host, then its first runtime launches inline (never via the
 * view-consumed launch queue, so the launch never depends on a mounted pane).
 */
async function launchDraftThread(launch: ThreadLaunchRequest): Promise<"started" | "cancelled"> {
  const thread = createDraftThread(launch);
  // Paint the first prompt before host persistence, exactly like the
  // worktree-provisioning path: a slow create round trip must not leave
  // the new pane empty while its first turn is already starting.
  const userMessageItemId =
    launch.userMessageItemId ??
    appendOptimisticInitialUserMessage(thread, launch.prompt, launch.segments);
  // Launch inline, never via the view-consumed launch queue — the launch
  // must not depend on which pane is mounted (see the worktree path above).
  try {
    if (!(await prepareDraftThread(thread, launch.project, launch.prompt, launch.segments))) {
      return "cancelled";
    }
    const currentThread = useAppStore.getState().threads.find((row) => row.id === thread.id);
    if (!currentThread || currentThread.archived) return "cancelled";
    await performInitialThreadLaunch({
      thread: currentThread,
      projectLocation: resolveProjectLocation(launch.project.location, launch.worktreePath),
      prompt: launch.prompt,
      ...(launch.segments ? { segments: launch.segments } : {}),
      ...(userMessageItemId ? { userMessageItemId } : {}),
      ...(launch.clientContext ? { clientContext: launch.clientContext } : {}),
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
}

/** Surface a failed launch on the thread row (error item + error status). */
export function markThreadLaunchFailed(threadId: string, error: unknown): void {
  const store = useAppStore.getState();
  // The pending create+launch intent survives every failure: a definite
  // pre-effect failure was already re-armed as a fresh attempt by the launch
  // path, and an uncertain outcome keeps the SAME operation id and exact body
  // for an explicit retry. Only an authoritative removal drops the intent.
  const thread = store.threads.find((row) => row.id === threadId);
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
    // A host-confirmed reference can arrive before the rejected launch RPC.
    // Preserve that earned recovery path instead of clearing it locally.
    canResumeWithConfig: thread?.canResumeWithConfig === true && thread.sessionRef !== undefined,
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
  const itemId = allocateInitialUserMessageItemId(thread, prompt, segments);
  if (!itemId) return undefined;

  useAppStore.getState().requestChatScrollToPrompt(thread.id);
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

function allocateInitialUserMessageItemId(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  const presentation = thread.presentationMode ?? "terminal";
  if (
    presentation !== "gui" ||
    !hasSendablePromptContent(prompt, segments) ||
    thread.sessionRef !== undefined
  ) {
    return undefined;
  }
  return `user-${crypto.randomUUID()}`;
}
