import { mkdirSync, statSync } from "node:fs";
import type { Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import {
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
  remoteProjectCommandResultSchema,
} from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import {
  beginProjectRemoval,
  dbDeleteProject,
  dbDeleteThread,
  dbGetProject,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbReorderProjectRelative,
  dbSetProjectLastDraftConfig,
  dbSetProjectWorkspace,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db";
import { discardPersistedProjectExperiments } from "@/host/remote/experimentOwnership";
import { applyRemoteProjectCommand } from "@/host/remote/projectCommands";
import { sortOrderForThread } from "@/host/remote/server/snapshots";
import { ensureHomeProjectRow } from "@/host/schedules";
import {
  createAppThread,
  resolveAddWorktreeArgs,
  type CreateAppThreadRequest,
  type CreateAppThreadResult,
} from "@/host/threads/appThreadLauncher";
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
  /**
   * Publish a bounded thread invalidation for host-local writes the renderer
   * funnel never sees (MCP create_thread and, through the returned deps, MCP
   * metadata updates). Optional for legacy embedders without a remote listener.
   */
  publishThreadsChanged?: (threadIds: readonly string[]) => void;
}

/** The subset of {@link AppControlsMcpIngressDeps} both hosts build identically. */
export interface SharedAppControlsIngressDeps {
  directoryExists(path: string): boolean;
  applyProjectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult>;
  updateProject(project: Project): void;
  createThread(request: CreateAppThreadRequest): Promise<CreateAppThreadResult>;
  updateThreadRow(threadId: string, mutate: (thread: Thread) => Thread): void;
  publishThreadsChanged?(threadIds: readonly string[]): void;
}

/**
 * Resolve the persisted Home project row, publishing `projects-changed` when
 * this call created it. Both host compositions route scheduled-run and
 * app-controls home-project resolution through here so host-local project
 * creation reaches remote membership instead of silently diverging.
 */
export function ensureHomeProjectWithPublish(publishProjectsChanged: () => void): Project {
  const existed = dbGetProject(HOME_PROJECT_ID) != null;
  const project = ensureHomeProjectRow();
  if (!existed) publishProjectsChanged();
  return project;
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
  const {
    call,
    sendThreadCommand,
    getSharedSettings,
    publishProjectsChanged,
    publishThreadsChanged,
  } = params;
  return {
    ...(publishThreadsChanged ? { publishThreadsChanged } : {}),
    directoryExists: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    applyProjectCommand: async (command) => {
      const application = await applyRemoteProjectCommand(command, {
        getProjects: dbGetProjects,
        getProject: dbGetProject,
        beginProjectRemoval,
        reorderProject: (input) => dbReorderProjectRelative(input),
        setProjectWorkspace: (projectId, workspaceId) =>
          dbSetProjectWorkspace(projectId, workspaceId),
        setProjectLastDraftConfig: (projectId, lastDraftConfig) =>
          dbSetProjectLastDraftConfig(projectId, lastDraftConfig),
        removeProjectExperiments: (project) =>
          discardPersistedProjectExperiments(project, (payload) =>
            call("removeExperimentWorktrees", payload),
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
      // App-controls only issues legacy kinds, whose response is the complete
      // result; a bounded response here would be a programming error.
      const parsed = remoteProjectCommandResultSchema.parse(application.response);
      publishProjectsChanged();
      return parsed;
    },
    updateProject: (project) => {
      dbUpsertProject(project, -Date.parse(project.createdAt));
      publishProjectsChanged();
    },
    createThread: async (request) => {
      const result = await createAppThread(
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
          ensureHomeProject: () => ensureHomeProjectWithPublish(publishProjectsChanged),
          getProject: dbGetProject,
          getSharedSettings,
          upsertThread: dbUpsertThread,
          deleteThread: dbDeleteThread,
          threadExists: (threadId) => dbGetThread(threadId) != null,
        },
        request,
      );
      // The new row bypassed the renderer→RPC `databaseChanged` funnel, so its
      // membership invalidation must be published explicitly (headless hosts
      // have no renderer to relay it).
      publishThreadsChanged?.([result.threadId]);
      return result;
    },
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
