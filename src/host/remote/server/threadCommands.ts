import { mkdirSync } from "node:fs";
import {
  remoteProjectCommandResponseSchema,
  remoteProjectCommandResultSchema,
  type RemoteProjectCommand,
  type RemoteProject,
  type RemoteProjectCommandResponse,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  emptyMcpLaunchSnapshot,
  type Project,
  type RemoteThreadCommand,
  type StartThreadPayload,
  type StartThreadResult,
  type Thread,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  beginProjectRemoval,
  dbDeleteProject,
  dbDeleteThread,
  dbGetProject,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbReorderProjectRelative,
  dbReorderThreadBlockRelative,
  dbSetProjectLastDraftConfig,
  dbSetProjectWorkspace,
  dbSetThreadWorkspace,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
  type CatalogIntentCommittedSignal,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import { buildWorktreeLocation } from "@/shared/worktree";
import { makeThreadTitle, titlePromptFromSegments } from "@/shared/threadTitle";
import { discardPersistedProjectExperiments } from "../experimentOwnership";
import { applyRemoteProjectCommand } from "../projectCommands";
import type { RemoteServerContext } from "./context";
import { prepareHostWorktree, removeHostWorktree } from "./hostWorktreeLifecycle";
import { sortOrderForThread } from "./snapshots";
import { applyThreadMetadataCommand, threadMetadataClosesSession } from "./threadMetadataCommands";

export { runRemoteProcedure } from "./threadProcedure";
export { applyRemoteThreadSwitch, retargetRemoteThreadForSwitch } from "./threadSwitch";

/**
 * Applies a remote project command. The DB is the source of truth: new
 * projects are written directly and clones are driven through the supervisor.
 * On the desktop the renderer learns about the change via the broadcast
 * `remote-projects-changed` event (and reloads from the DB on next launch);
 * headless servers have no renderer, so the DB write is the whole story.
 *
 * Legacy kinds read and return the complete catalog; bounded catalog kinds
 * return ONLY the bounded response, so the caller's declaration-aware
 * publication can decide (once) whether the authoritative list must be read at
 * all.
 */
export type RemoteProjectCommandOutcome =
  | {
      readonly kind: "complete";
      readonly projects: readonly Project[];
      readonly broadcastProjects: readonly RemoteProject[];
      readonly response: RemoteProjectCommandResponse;
    }
  | {
      readonly kind: "bounded";
      readonly response: RemoteProjectCommandResponse;
    };

export function runProjectCommand(
  ctx: RemoteServerContext,
  command: RemoteProjectCommand,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
  options: {
    readonly resultMode?: "complete" | "bounded";
    readonly onEffectBoundary?: () => void;
  } = {},
): Promise<RemoteProjectCommandOutcome> {
  return applyRemoteProjectCommand(
    command,
    {
      getProjects: () => dbGetProjects(),
      getProject: (projectId) => dbGetProject(projectId),
      beginProjectRemoval,
      reorderProject: (input) => dbReorderProjectRelative(input, onCatalogCommitted),
      setProjectWorkspace: (projectId, workspaceId) =>
        dbSetProjectWorkspace(projectId, workspaceId, onCatalogCommitted),
      setProjectLastDraftConfig: (projectId, lastDraftConfig) =>
        dbSetProjectLastDraftConfig(projectId, lastDraftConfig, onCatalogCommitted),
      removeProjectExperiments: (project) =>
        discardPersistedProjectExperiments(project, (payload) =>
          ctx.options.callSupervisor("removeExperimentWorktrees", payload),
        ),
      hasRunningProjectThread: (projectId) =>
        dbGetThreads().some(
          (thread) => thread.projectId === projectId && thread.status === "working",
        ),
      listProjectThreadIds: (projectId) =>
        dbGetThreads()
          .filter((thread) => thread.projectId === projectId)
          .map((thread) => thread.id),
      upsertProject: (project, sortOrder) => dbUpsertProject(project, sortOrder),
      updateProject: (project) => dbUpdateProject(project),
      deleteProject: (projectId) => dbDeleteProject(projectId),
      closeThread: (threadId) => closeThreadBestEffort(ctx, threadId),
      cloneRepo: (input) => ctx.options.callSupervisor("cloneRepo", input),
      makeDirectory: (path) => {
        mkdirSync(path);
      },
      platform: process.platform,
      now: () => new Date().toISOString(),
    },
    options,
  ).then((application) => {
    if (application.kind === "bounded") {
      return {
        kind: "bounded",
        response: remoteProjectCommandResponseSchema.parse(application.response),
      };
    }
    // The broadcast always carries the wire-safe complete list; the response
    // is the parsed per-kind shape (complete or bounded).
    return {
      kind: "complete",
      projects: application.projects,
      broadcastProjects: remoteProjectCommandResultSchema.parse({
        projects: application.projects,
      }).projects,
      response: remoteProjectCommandResponseSchema.parse(application.response),
    };
  });
}

/**
 * Applies thread commands to the durable DB path used by remote snapshots.
 * Returns true only for commands that still have renderer-owned side effects
 * after the host has applied the durable work. `onCatalogCommitted` fires when
 * a narrow catalog write commits, before the change-listener fan-out.
 */
export async function applyRemoteThreadCommand(
  ctx: RemoteServerContext,
  command: RemoteThreadCommand,
  onCatalogCommitted?: CatalogIntentCommittedSignal,
): Promise<boolean> {
  switch (command.kind) {
    case "prepare-worktree":
      await prepareHostWorktree(ctx, {
        projectId: command.projectId,
        worktreePath: command.worktreePath,
      });
      return false;
    case "start":
      await startRemoteThread(ctx, command);
      return false;
    case "rename":
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "acknowledge":
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "set-done":
      if (threadMetadataClosesSession(command)) {
        await closeThreadBestEffort(ctx, command.threadId);
      }
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "set-starred":
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "set-worktree": {
      const previous = dbGetThreads().find((thread) => thread.id === command.threadId);
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        worktreePath: command.worktreePath,
        ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
        updatedAt: new Date().toISOString(),
      }));
      if (command.isNewWorktree && previous) {
        await prepareHostWorktree(ctx, {
          projectId: previous.projectId,
          worktreePath: command.worktreePath,
        });
      }
      return false;
    }
    case "set-group":
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "clear-group": {
      const groupId = dbGetThreads().find((thread) => thread.id === command.threadId)?.groupId;
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      if (groupId) {
        const remainder = dbGetThreads().filter((thread) => thread.groupId === groupId);
        if (remainder.length === 1) {
          const remainderId = remainder[0]!.id;
          updateRemoteThread(remainderId, (thread) =>
            applyThreadMetadataCommand(thread, { kind: "clear-group", threadId: remainderId }),
          );
        }
      }
      return false;
    }
    case "archive":
      await closeThreadBestEffort(ctx, command.threadId);
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "unarchive":
      updateRemoteThread(command.threadId, (thread) => applyThreadMetadataCommand(thread, command));
      return false;
    case "delete":
      await closeThreadBestEffort(ctx, command.threadId);
      dbDeleteThread(command.threadId);
      return false;
    // ── Narrow catalog mutations (mirror-free, bounded {ok:true}) ───────
    case "reorder": {
      const outcome = dbReorderThreadBlockRelative(
        {
          projectId: command.projectId,
          anchorThreadId: command.threadId,
          threadIds: command.threadIds,
          targetThreadId: command.targetThreadId,
          placement: command.placement,
        },
        onCatalogCommitted,
      );
      switch (outcome.status) {
        case "applied":
        case "noop":
          return false;
        case "project_missing":
          throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
        case "thread_missing":
          // Deleted or never-seen ids: the caller's projection is stale.
          throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
        case "project_mismatch":
          throw new RemoteHttpError(
            "thread_project_mismatch",
            "Thread is not part of this project.",
            409,
          );
        case "block_duplicate":
          throw new RemoteHttpError(
            "invalid_request",
            "Reorder block contains duplicate thread ids.",
            400,
          );
        case "anchor_mismatch":
          throw new RemoteHttpError(
            "invalid_request",
            "Reorder anchor must be the first thread id in the block.",
            400,
          );
      }
    }
    case "set-workspace": {
      if (!dbSetThreadWorkspace(command.threadId, command.workspaceId, onCatalogCommitted)) {
        throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
      }
      return false;
    }
    case "delete-worktree-group": {
      const groupThreads = dbGetThreads().filter((thread) => command.threadIds.includes(thread.id));
      const worktreeBranch = groupThreads.find((thread) => thread.worktreeBranch)?.worktreeBranch;
      await Promise.all(command.threadIds.map((threadId) => closeThreadBestEffort(ctx, threadId)));
      for (const threadId of command.threadIds) dbDeleteThread(threadId);
      await removeHostWorktree(ctx, {
        projectId: command.projectId,
        worktreePath: command.worktreePath,
        ...(worktreeBranch ? { worktreeBranch } : {}),
      });
      return false;
    }
  }
}

/** Empty-prompt reopen takes launch state from the host, never a stale client. */
export async function ensureRemoteThreadRunning(
  ctx: RemoteServerContext,
  threadId: string,
  initialSize: StartThreadPayload["initialSize"],
): Promise<StartThreadResult> {
  const thread = dbGetThread(threadId);
  if (!thread) throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  const project = dbGetProjects().find((entry) => entry.id === thread.projectId);
  if (!project) throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
  const mcpSnapshot =
    ctx.options.resolveMcpLaunchSnapshot?.(thread.projectId) ?? emptyMcpLaunchSnapshot();
  return ctx.options.callSupervisor("ensureThreadRunning", {
    threadId,
    projectLocation: thread.worktreePath
      ? buildWorktreeLocation(project.location, thread.worktreePath)
      : project.location,
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt: "",
    initialSize,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...mcpSnapshot,
  });
}

async function startRemoteThread(
  ctx: RemoteServerContext,
  command: Extract<RemoteThreadCommand, { kind: "start" }>,
): Promise<void> {
  const project = dbGetProjects().find((entry) => entry.id === command.projectId);
  if (!project) {
    throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
  }

  const threads = dbGetThreads();
  const now = new Date().toISOString();
  const presentationMode = command.presentationMode ?? "terminal";
  const titlePrompt = titlePromptFromSegments(command.prompt, command.segments);
  const thread: Thread = {
    id: command.threadId,
    projectId: command.projectId,
    // The renderer's mirror of this command honors an explicit title/group
    // (a remote fork inherits both from its source), so the durable row must
    // too — otherwise the next client snapshot strips them back. The same
    // applies to every other semantically applicable creation field the
    // command carries (worktree, parent/pr lineage, workspace); the supervisor
    // launch below additionally honors the client's exact `initialSize`.
    title: command.title ?? (makeThreadTitle(titlePrompt) || "New thread"),
    agentKind: command.agentKind,
    ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
    config: command.config,
    status: "launching",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode,
    ...(presentationMode !== "terminal" ? { threadStatusSource: "server" } : {}),
    ...(command.groupId ? { groupId: command.groupId } : {}),
    ...(command.groupName ? { groupName: command.groupName } : {}),
    ...(command.worktreePath ? { worktreePath: command.worktreePath } : {}),
    ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
    ...(command.parentThreadId ? { parentThreadId: command.parentThreadId } : {}),
    ...(command.prNumber ? { prNumber: command.prNumber } : {}),
    ...(command.workspaceId ? { workspaceId: command.workspaceId } : {}),
    createdAt: now,
    updatedAt: now,
    activeTurnStartedAt: now,
  };
  dbUpsertThread(thread, sortOrderForThread(threads, command.threadId));

  const projectLocation = command.worktreePath
    ? buildWorktreeLocation(project.location, command.worktreePath)
    : project.location;
  const mcpSnapshot =
    ctx.options.resolveMcpLaunchSnapshot?.(command.projectId) ?? emptyMcpLaunchSnapshot();
  // The durable row written above IS the retained evidence: a failed supervisor
  // response does NOT prove the provider never started (the launch may have
  // spawned before the reply was lost), so the row is deliberately not deleted
  // here. Absence must never be treated as proof of no effect; the route's
  // receipt already records `uncertain`, and a later resume reconciles the real
  // session state while the row keeps any client reconcile read truthful.
  await ctx.options.callSupervisor("startThread", {
    threadId: command.threadId,
    projectLocation,
    agentKind: command.agentKind,
    ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
    config: command.config,
    prompt: command.prompt,
    ...(command.segments ? { segments: command.segments } : {}),
    initialSize: command.initialSize ?? DEFAULT_TERMINAL_SIZE,
    ...(command.presentationMode ? { presentationMode: command.presentationMode } : {}),
    ...(command.userMessageItemId ? { userMessageItemId: command.userMessageItemId } : {}),
    ...mcpSnapshot,
  });
}

function updateRemoteThread(threadId: string, update: (thread: Thread) => Thread): void {
  const threads = dbGetThreads();
  const thread = threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  dbUpsertThread(update(thread), sortOrderForThread(threads, threadId));
}

async function closeThreadBestEffort(ctx: RemoteServerContext, threadId: string): Promise<void> {
  await ctx.options.callSupervisor("closeThread", { threadId }).catch(() => undefined);
}
