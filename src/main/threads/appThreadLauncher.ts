import { randomUUID } from "node:crypto";
import type {
  AgentKind,
  AgentStatusesResponse,
  Project,
  ProjectLocation,
  RemoteThreadCommand,
  StartThreadPayload,
  Thread,
  ThreadConfig,
} from "@/shared/contracts";
import { DEFAULT_TERMINAL_SIZE, resolveMcpLaunchSnapshot } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { isHomeProjectId } from "@/shared/homeScope";
import { makeThreadTitle } from "@/shared/threadTitle";
import { buildWorktreeLocation, resolveWorktreePlacement } from "@/shared/worktree";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import { resolveUnrestrictedThreadPermissions } from "./threadLaunchConfig";

/** Host surface the launcher needs — the same main-side seams schedules use. */
export interface AppThreadLauncherDeps {
  /** Launch the child session in the supervisor (main → supervisor request). */
  startThread(payload: StartThreadPayload): Promise<unknown>;
  /** Cached agent detection for the given WSL distros (supervisor request). */
  getAgentStatuses(wslDistros: string[]): Promise<AgentStatusesResponse>;
  /**
   * Create a git worktree (new branch) in the project's repo; returns its path.
   * Receives the already-read shared settings so a single launch reads them once.
   */
  addWorktree(input: {
    location: ProjectLocation;
    branch: string;
    settings: SharedSettings;
  }): Promise<{ path: string }>;
  /** Roll back a worktree created by a launch that then failed (best effort). */
  removeWorktree(input: { location: ProjectLocation; path: string }): Promise<void>;
  /** Mirror the new thread to the renderer store; false when no window is up. */
  sendThreadCommand(command: RemoteThreadCommand): boolean;
  /** Resolve (creating if absent) the persisted home-scope project row. */
  ensureHomeProject(): Project;
  /** Resolve a persisted project row by id, or null when it no longer exists. */
  getProject(projectId: string): Project | null;
  /** Current global MCP/worktree settings. */
  getSharedSettings(): SharedSettings;
  upsertThread(thread: Thread, sortOrder: number): void;
  deleteThread(threadId: string): void;
  threadExists(threadId: string): boolean;
  now?: () => number;
  newId?: () => string;
}

/** Arguments accepted by the app-controls `create_thread` tool. */
export interface CreateAppThreadRequest {
  projectId: string;
  prompt: string;
  agentKind: AgentKind;
  model: string;
  effort?: string;
  fast?: boolean;
  title?: string;
  worktree?: { branch?: string };
}

export interface CreateAppThreadResult {
  threadId: string;
  title: string;
  projectId: string;
  worktreePath?: string;
  branch?: string;
}

/**
 * Create a REAL first-class app thread (persisted row, sidebar-visible,
 * optionally worktree-backed) and initiate its launch, then return the new id.
 *
 * Mirrors {@link ScheduleRunCoordinator.runScheduleAsThread}'s proven start
 * ordering — persist the row first, mirror it to the renderer (`launchRuntime:
 * false`, `focus: false`), then call the supervisor's `startThread` — but does
 * NOT wait for the opening turn to finish (matching the orchestrator's
 * `create_thread`). The renderer owns thread metadata, so the mirror command is
 * how the desktop store learns about the row; a `false` return (no window) is
 * expected on headless hosts and never fails the launch.
 */
export async function createAppThread(
  deps: AppThreadLauncherDeps,
  request: CreateAppThreadRequest,
): Promise<CreateAppThreadResult> {
  const project = resolveProject(deps, request.projectId);
  const threadId = (deps.newId ?? randomUUID)();
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  // Read shared settings once and flow the value to every consumer below
  // (worktree placement + the launch MCP snapshot).
  const settings = deps.getSharedSettings();

  // A worktree is created up front so the row and launch both target it.
  let worktreePath: string | undefined;
  let branch: string | undefined;
  if (request.worktree) {
    branch = request.worktree.branch?.trim() || generateWorktreeBranch();
    const created = await deps.addWorktree({ location: project.location, branch, settings });
    worktreePath = created.path;
  }
  const threadLocation = worktreePath
    ? buildWorktreeLocation(project.location, worktreePath)
    : project.location;

  const config: ThreadConfig = {
    model: request.model,
    ...(request.effort ? { effort: request.effort } : {}),
    ...(request.fast !== undefined ? { fast: request.fast } : {}),
    ...(await resolveUnrestrictedThreadPermissions(
      deps.getAgentStatuses,
      request.agentKind,
      threadLocation,
    )),
  };

  const customTitle = request.title?.trim();
  const title = customTitle || makeThreadTitle(request.prompt) || "New thread";
  const thread: Thread = {
    id: threadId,
    projectId: project.id,
    title,
    agentKind: request.agentKind,
    config,
    status: "launching",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    threadStatusSource: "server",
    ...(worktreePath ? { worktreePath } : {}),
    ...(branch ? { worktreeBranch: branch } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
    activeTurnStartedAt: nowIso,
  };

  const existed = deps.threadExists(threadId);
  // New rows sort to the top via a descending timestamp (same convention as the
  // orchestrator bridge, schedules, and the remote-access server).
  deps.upsertThread(thread, -Date.now());

  deps.sendThreadCommand({
    kind: "start",
    threadId,
    projectId: project.id,
    agentKind: request.agentKind,
    config,
    prompt: request.prompt,
    ...(customTitle ? { title: customTitle } : {}),
    presentationMode: "gui",
    launchRuntime: false,
    focus: false,
    ...(worktreePath ? { worktreePath } : {}),
    ...(branch ? { worktreeBranch: branch } : {}),
    ...(worktreePath ? { isNewWorktree: true } : {}),
  });

  const startPayload: StartThreadPayload = {
    threadId,
    projectLocation: threadLocation,
    agentKind: request.agentKind,
    config,
    prompt: request.prompt,
    initialSize: DEFAULT_TERMINAL_SIZE,
    presentationMode: "gui",
    ...resolveMcpLaunchSnapshot(settings, project.mcpServers ?? []),
  };

  try {
    await deps.startThread(startPayload);
  } catch (error) {
    // Roll back the fresh row (follow the orchestrator/schedule bridge): drop it
    // from the DB and tell the renderer to forget it, but keep a pre-existing
    // row. Also remove a worktree WE created this call so a retry isn't poisoned.
    if (!existed) {
      deps.deleteThread(threadId);
      deps.sendThreadCommand({ kind: "delete", threadId });
    }
    if (worktreePath) {
      await deps
        .removeWorktree({ location: project.location, path: worktreePath })
        .catch(() => undefined);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  return {
    threadId,
    title,
    projectId: project.id,
    ...(worktreePath ? { worktreePath } : {}),
    ...(branch ? { branch } : {}),
  };
}

/**
 * Worktree placement resolved from global settings, matching the supervisor's
 * `createWorktree` pipeline (per-project overrides live in the renderer DB and
 * aren't visible here). Callers pass the returned fields straight to the
 * `gitAddWorktree` supervisor RPC.
 */
export function resolveAddWorktreeArgs(
  settings: SharedSettings,
  location: ProjectLocation,
  branch: string,
): {
  branch: string;
  createBranch: true;
  transferUncommitted: false;
  keepChangesInSource: false;
  worktreeRoot?: string;
  worktreeOmitRepoDir?: true;
} {
  const placement = resolveWorktreePlacement(settings, undefined, location);
  return {
    branch,
    createBranch: true,
    transferUncommitted: false,
    keepChangesInSource: false,
    ...(placement.root ? { worktreeRoot: placement.root } : {}),
    ...(placement.omitRepoDir ? { worktreeOmitRepoDir: true as const } : {}),
  };
}

/**
 * Resolve the project the new thread lives in. The built-in Home scope resolves
 * to the persisted Home row; any other id must reference an existing project.
 */
function resolveProject(deps: AppThreadLauncherDeps, projectId: string): Project {
  if (isHomeProjectId(projectId)) return deps.ensureHomeProject();
  const project = deps.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}
