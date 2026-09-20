import { mkdirSync } from "node:fs";
import {
  remoteProjectCommandResultSchema,
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
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
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import { buildWorktreeLocation } from "@/shared/worktree";
import { makeThreadTitle, titlePromptFromSegments } from "@/shared/threadTitle";
import { discardPersistedProjectExperiments } from "../experimentOwnership";
import { applyRemoteProjectCommand } from "../projectCommands";
import type { RemoteServerContext } from "./context";
import { prepareHostWorktree, removeHostWorktree } from "./hostWorktreeLifecycle";
import { sortOrderForThread } from "./snapshots";

export { runRemoteProcedure } from "./threadProcedure";
export { applyRemoteThreadSwitch, retargetRemoteThreadForSwitch } from "./threadSwitch";

/**
 * Applies a remote project command. The DB is the source of truth: new
 * projects are written directly and clones are driven through the supervisor.
 * On the desktop the renderer learns about the change via the broadcast
 * `remote-projects-changed` event (and reloads from the DB on next launch);
 * headless servers have no renderer, so the DB write is the whole story.
 */
export function runProjectCommand(
  ctx: RemoteServerContext,
  command: RemoteProjectCommand,
): Promise<{
  readonly projects: readonly Project[];
  readonly response: RemoteProjectCommandResult;
}> {
  return applyRemoteProjectCommand(command, {
    getProjects: () => dbGetProjects(),
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
  }).then((result) => ({
    projects: result.projects,
    response: remoteProjectCommandResultSchema.parse(result),
  }));
}

/**
 * Applies thread commands to the durable DB path used by remote snapshots.
 * Returns true only for commands that still have renderer-owned side effects
 * after the host has applied the durable work.
 */
export async function applyRemoteThreadCommand(
  ctx: RemoteServerContext,
  command: RemoteThreadCommand,
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
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        title: command.title,
      }));
      return false;
    case "acknowledge":
      updateRemoteThread(command.threadId, (thread) =>
        thread.status === "finished" ? { ...thread, status: "idle" } : thread,
      );
      return false;
    case "set-done":
      if (command.done) {
        await closeThreadBestEffort(ctx, command.threadId);
        const now = new Date().toISOString();
        updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          done: true,
          doneAt: now,
          starred: false,
        }));
      } else {
        updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          done: false,
          doneAt: undefined,
        }));
      }
      return false;
    case "set-starred":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        starred: command.starred,
      }));
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
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        groupId: command.groupId,
        groupName: command.groupName,
      }));
      return false;
    case "clear-group": {
      const groupId = dbGetThreads().find((thread) => thread.id === command.threadId)?.groupId;
      updateRemoteThread(command.threadId, withoutThreadGroup);
      if (groupId) {
        const remainder = dbGetThreads().filter((thread) => thread.groupId === groupId);
        if (remainder.length === 1) updateRemoteThread(remainder[0]!.id, withoutThreadGroup);
      }
      return false;
    }
    case "archive":
      await closeThreadBestEffort(ctx, command.threadId);
      {
        const now = new Date().toISOString();
        updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          archived: true,
          archivedAt: now,
          updatedAt: now,
        }));
      }
      return false;
    case "unarchive":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        archived: false,
        archivedAt: undefined,
        updatedAt: new Date().toISOString(),
      }));
      return false;
    case "delete":
      await closeThreadBestEffort(ctx, command.threadId);
      dbDeleteThread(command.threadId);
      return false;
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
  const existing = threads.some((thread) => thread.id === command.threadId);
  const now = new Date().toISOString();
  const presentationMode = command.presentationMode ?? "terminal";
  const titlePrompt = titlePromptFromSegments(command.prompt, command.segments);
  const thread: Thread = {
    id: command.threadId,
    projectId: command.projectId,
    // The renderer's mirror of this command honors an explicit title/group
    // (a remote fork inherits both from its source), so the durable row must
    // too — otherwise the next client snapshot strips them back.
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
  try {
    await ctx.options.callSupervisor("startThread", {
      threadId: command.threadId,
      projectLocation,
      agentKind: command.agentKind,
      ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
      config: command.config,
      prompt: command.prompt,
      ...(command.segments ? { segments: command.segments } : {}),
      initialSize: DEFAULT_TERMINAL_SIZE,
      ...(command.presentationMode ? { presentationMode: command.presentationMode } : {}),
      ...(command.userMessageItemId ? { userMessageItemId: command.userMessageItemId } : {}),
      ...mcpSnapshot,
    });
  } catch (error) {
    if (!existing) dbDeleteThread(command.threadId);
    throw error;
  }
}

function updateRemoteThread(threadId: string, update: (thread: Thread) => Thread): void {
  const threads = dbGetThreads();
  const thread = threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  dbUpsertThread(update(thread), sortOrderForThread(threads, threadId));
}

function withoutThreadGroup(thread: Thread): Thread {
  const { groupId: _groupId, groupName: _groupName, ...ungrouped } = thread;
  return ungrouped;
}

async function closeThreadBestEffort(ctx: RemoteServerContext, threadId: string): Promise<void> {
  await ctx.options.callSupervisor("closeThread", { threadId }).catch(() => undefined);
}
