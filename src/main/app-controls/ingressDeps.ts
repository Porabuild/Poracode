import { mkdirSync, statSync } from "node:fs";
import type { Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import {
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
  remoteProjectCommandResultSchema,
} from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProject,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "@/main/db";
import { hasPersistedProjectExperiment } from "@/main/remote/experimentOwnership";
import { applyRemoteProjectCommand } from "@/main/remote/projectCommands";
import { sortOrderForThread } from "@/main/remote/server/snapshots";
import { ensureHomeProjectRow } from "@/main/schedules";
import {
  createAppThread,
  resolveAddWorktreeArgs,
  type CreateAppThreadRequest,
  type CreateAppThreadResult,
} from "@/main/threads/appThreadLauncher";
import type { SupervisorCall } from "./supervisorCaller";

/** Host seams the shared app-controls ingress deps depend on. Only the fields
 *  that genuinely differ between the desktop and headless hosts are parameters. */
export interface AppControlsIngressDepsParams {
  /** Typed supervisor RPC entrypoint (`supervisorClient.call`). */
  call: SupervisorCall;
  /** Mirror a thread command to the renderer store; `false` when no UI is up. */
  sendThreadCommand: (command: RemoteThreadCommand) => boolean;
  /** Read the current shared settings from disk. */
  getSharedSettings: () => SharedSettings;
  /** Notify listeners that the project list changed (desktop vs headless surfaces). */
  publishProjectsChanged: () => void;
}

/** The subset of {@link AppControlsMcpIngressDeps} both hosts build identically. */
export interface SharedAppControlsIngressDeps {
  directoryExists(path: string): boolean;
  applyProjectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult>;
  updateProject(project: Project): void;
  createThread(request: CreateAppThreadRequest): Promise<CreateAppThreadResult>;
  updateThreadRow(threadId: string, mutate: (thread: Thread) => Thread): void;
}

/**
 * Build the host-agnostic app-controls ingress deps. The DB-direct project /
 * thread wiring is identical across the desktop and headless hosts; the only
 * host-specific seams (`sendThreadCommand`, `getSharedSettings`, and the
 * projects-changed publish) are taken as parameters so behavior is preserved:
 * the desktop still mirrors to its renderer, the headless host stays DB-direct.
 */
export function buildSharedAppControlsIngressDeps(
  params: AppControlsIngressDepsParams,
): SharedAppControlsIngressDeps {
  const { call, sendThreadCommand, getSharedSettings, publishProjectsChanged } = params;
  return {
    directoryExists: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    applyProjectCommand: async (command) => {
      const result = await applyRemoteProjectCommand(command, {
        getProjects: dbGetProjects,
        hasProjectExperiment: (projectId) => hasPersistedProjectExperiment(projectId),
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
        closeThread: (threadId) =>
          call("closeThread", { threadId })
            .then(() => undefined)
            .catch(() => undefined),
        cloneRepo: (input) => call("cloneRepo", input),
        makeDirectory: (path) => {
          mkdirSync(path);
        },
        platform: process.platform,
        now: () => new Date().toISOString(),
      });
      const parsed = remoteProjectCommandResultSchema.parse(result);
      publishProjectsChanged();
      return parsed;
    },
    updateProject: (project) => {
      dbUpsertProject(project, -Date.parse(project.createdAt));
      publishProjectsChanged();
    },
    createThread: (request) =>
      createAppThread(
        {
          startThread: (payload) => call("startThread", payload),
          getAgentStatuses: (wslDistros) => call("getAgentStatuses", { wslDistros }),
          addWorktree: ({ location, branch, settings }) =>
            call("gitAddWorktree", {
              projectLocation: location,
              ...resolveAddWorktreeArgs(settings, location, branch),
            }),
          removeWorktree: ({ location, path }) =>
            call("gitRemoveWorktree", {
              projectLocation: location,
              path,
              force: true,
              deleteBranch: true,
            }).then(() => undefined),
          sendThreadCommand,
          ensureHomeProject: ensureHomeProjectRow,
          getProject: dbGetProject,
          getSharedSettings,
          upsertThread: dbUpsertThread,
          deleteThread: dbDeleteThread,
          threadExists: (threadId) => dbGetThread(threadId) != null,
        },
        request,
      ),
    updateThreadRow: (threadId, mutate) => {
      // Sort order genuinely needs the full list (sortOrderForThread indexes
      // into it), so the single row is read from that same snapshot.
      const threads = dbGetThreads();
      const current = threads.find((entry) => entry.id === threadId);
      if (!current) return;
      dbUpsertThread(mutate(current), sortOrderForThread(threads, threadId));
    },
  };
}
