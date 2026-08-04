import { mkdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import {
  REMOTE_PROCEDURE_SPECS,
  isRemoteProcedure,
  remoteGitCallPayloadSchema,
  remoteProjectCommandResultSchema,
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  emptyMcpLaunchSnapshot,
  type Project,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import type { IpcProcedurePayload, SupervisorProcedureName } from "@/shared/ipc";
import { ipcProcedureMap } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjects,
  dbGetThreads,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "../../db";
import { RemoteHttpError } from "../auth";
import { buildWorktreeLocation } from "@/shared/worktree";
import { makeThreadTitle, titlePromptFromSegments } from "@/shared/threadTitle";
import {
  assertRemoteGitMutationExperimentSafe,
  discardPersistedProjectExperiments,
} from "../experimentOwnership";
import { applyRemoteProjectCommand } from "../projectCommands";
import type { RemoteServerContext } from "./context";
import { readJsonBody } from "./requestBody";
import { sortOrderForThread } from "./snapshots";

/**
 * Generic desktop-supervisor passthrough. The PWA reuses desktop-backed
 * surfaces which call bridge methods directly; rather than a REST route per
 * method, the client posts `{ procedure, payload }` here. Only allowlisted
 * procedures are accepted, each gated by its required scope and validated
 * against its own payload schema before reaching the supervisor.
 */
export async function runRemoteProcedure(
  ctx: RemoteServerContext,
  req: IncomingMessage,
): Promise<unknown> {
  // Reject unauthenticated callers BEFORE reading/parsing the body or revealing
  // whether a procedure is allowlisted. Otherwise an unauthenticated request can
  // distinguish a known-but-invalid procedure (403) from a known one (401) — a
  // pre-auth enumeration oracle — and forces the server to buffer+parse up to
  // 1MB per unauthenticated request. `[]` requires only a valid token (no scope);
  // the per-procedure scope is still enforced below once the procedure is known.
  ctx.security.requireBearer(req, []);
  const { procedure, payload } = remoteGitCallPayloadSchema.parse(await readJsonBody(req));
  if (!isRemoteProcedure(procedure)) {
    throw new RemoteHttpError(
      "git_procedure_not_allowed",
      `Procedure "${procedure}" is not available to remote clients.`,
      403,
    );
  }
  ctx.security.requireBearer(req, [REMOTE_PROCEDURE_SPECS[procedure].scope]);
  const name = procedure as SupervisorProcedureName;
  const parsedPayload = ipcProcedureMap[name].payloadSchema.parse(payload) as IpcProcedurePayload<
    typeof name
  >;
  assertRemoteGitMutationExperimentSafe(procedure, parsedPayload);
  return ctx.options.callSupervisor(name, parsedPayload);
}

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
 * Returns true for commands whose behavior still requires renderer-owned side
 * effects beyond simple thread metadata persistence.
 */
export async function applyRemoteThreadCommand(
  ctx: RemoteServerContext,
  command: RemoteThreadCommand,
): Promise<boolean> {
  switch (command.kind) {
    case "prepare-worktree":
      return true;
    case "start":
      await startRemoteThread(ctx, command);
      return false;
    case "rename":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        title: command.title,
        updatedAt: new Date().toISOString(),
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
    case "set-worktree":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        worktreePath: command.worktreePath,
        ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
        updatedAt: new Date().toISOString(),
      }));
      return false;
    case "set-group":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        groupId: command.groupId,
        groupName: command.groupName,
      }));
      return false;
    case "archive":
      await closeThreadBestEffort(ctx, command.threadId);
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        archived: true,
        updatedAt: new Date().toISOString(),
      }));
      return false;
    case "unarchive":
      updateRemoteThread(command.threadId, (thread) => ({
        ...thread,
        archived: false,
        updatedAt: new Date().toISOString(),
      }));
      return false;
    case "delete":
      await closeThreadBestEffort(ctx, command.threadId);
      dbDeleteThread(command.threadId);
      return false;
    case "delete-worktree-group":
      await Promise.all(command.threadIds.map((threadId) => closeThreadBestEffort(ctx, threadId)));
      for (const threadId of command.threadIds) dbDeleteThread(threadId);
      return true;
  }
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
    title: makeThreadTitle(titlePrompt) || "New thread",
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

async function closeThreadBestEffort(ctx: RemoteServerContext, threadId: string): Promise<void> {
  await ctx.options.callSupervisor("closeThread", { threadId }).catch(() => undefined);
}
