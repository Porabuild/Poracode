import { randomUUID } from "node:crypto";
import {
  DEFAULT_TERMINAL_SIZE,
  resolveMcpLaunchSnapshot,
  scheduledTaskConfigSchema,
  type AgentKind,
  type AgentStatusesResponse,
  type Project,
  type ProjectLocation,
  type RemoteThreadCommand,
  type ScheduledTaskConfig,
  type StartThreadPayload,
  type Thread,
  type ThreadConfig,
} from "@/shared/contracts";
import type { SelectionBinding } from "@/shared/selectionBinding.schemas";
import type { SharedSettings } from "@/shared/settings";
import { isHomeProjectId } from "@/shared/homeScope";
import { msg } from "@/shared/messages";
import {
  captureProjectExecutionScope,
  hasSameProjectExecutionScope,
} from "./projectExecutionScope";
import { makeThreadTitle } from "@/shared/threadTitle";
import { buildWorktreeLocation, resolveWorktreePlacement } from "@/shared/worktree";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import {
  resolveHostThreadTitlePrompt,
  resolveUnrestrictedThreadPermissions,
} from "./threadLaunchConfig";

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
  /** Remaining actual selection controls; presence is exact — `false` is a value. */
  thinking?: boolean;
  contextSize?: string;
  /** Recognized selection binding riding along with the actual controls. */
  selectionBinding?: SelectionBinding;
  title?: string;
  worktree?: { branch?: string };
  existingWorktree?: { path: string; branch: string };
  prNumber?: number;
  /** Home-thread workspace tag; ignored for real projects. */
  workspaceId?: string;
}

/**
 * Ephemeral, host-only launch admission for one `createAppThread` call. The
 * gate never travels in a wire payload; it is invoked before the first effect
 * (including Home/project resolution and worktree creation) and again after
 * each awaited worktree, permission, and title seam — immediately before
 * thread persistence, publication, and spawn. Throwing refuses the launch,
 * and the launcher's rollback contract applies to effects already made.
 */
export interface CreateAppThreadLaunchOptions {
  admitLaunch?: () => void;
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
  options: CreateAppThreadLaunchOptions = {},
): Promise<CreateAppThreadResult> {
  // Admission before the first effect, so a refused launch never resolves a
  // Home project row, creates a worktree, or persists anything.
  options.admitLaunch?.();
  // Validate the complete known selection before ANY effect — including Home
  // row creation — so a mistyped control, unknown metadata, or a future
  // binding is refused instead of stripped and launched. The canonical
  // schema is strict on purpose and keeps empty/false carriers exact.
  const selection = parseLaunchSelection(request);
  const project = resolveProject(deps, request.projectId);
  const threadId = (deps.newId ?? randomUUID)();
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  // Read shared settings once and flow the value to every consumer below
  // (worktree placement + the launch MCP snapshot).
  const settings = deps.getSharedSettings();
  const scope = captureProjectExecutionScope(project);
  // The project row can move or disappear while the launch awaits; every
  // checkpoint below re-reads it and compares the real location and remote
  // identity — never the id, which stays stable across a same-id relocation
  // (and the Home id is synthetic, hiding its location entirely).
  const assertProjectScope = () => {
    const fresh = deps.getProject(request.projectId);
    if (!fresh || !hasSameProjectExecutionScope(fresh, scope)) {
      throw new Error(msg("thread.projectLaunchStale"));
    }
  };

  // A worktree is created up front so the row and launch both target it.
  let worktreePath = request.existingWorktree?.path;
  let branch = request.existingWorktree?.branch;
  let createdWorktree = false;
  const existed = deps.threadExists(threadId);
  let persistedRow = false;

  try {
    if (!request.existingWorktree && request.worktree) {
      branch = request.worktree.branch?.trim() || generateWorktreeBranch();
      const created = await deps.addWorktree({ location: project.location, branch, settings });
      worktreePath = created.path;
      createdWorktree = true;
    }
    assertProjectScope();
    options.admitLaunch?.();

    const threadLocation = worktreePath
      ? buildWorktreeLocation(project.location, worktreePath)
      : project.location;

    const config: ThreadConfig = {
      model: selection.model,
      // Presence is exact: an empty effort, a false flag, and a recognized
      // binding are real selection values, not equivalent absences.
      ...(selection.effort !== undefined ? { effort: selection.effort } : {}),
      ...(selection.fast !== undefined ? { fast: selection.fast } : {}),
      ...(selection.thinking !== undefined ? { thinking: selection.thinking } : {}),
      ...(selection.contextSize !== undefined ? { contextSize: selection.contextSize } : {}),
      ...(selection.selectionBinding !== undefined
        ? { selectionBinding: selection.selectionBinding }
        : {}),
      ...(await resolveUnrestrictedThreadPermissions(
        deps.getAgentStatuses,
        request.agentKind,
        threadLocation,
      )),
    };
    assertProjectScope();
    options.admitLaunch?.();

    const customTitle = request.title?.trim();
    const title =
      customTitle ||
      makeThreadTitle(
        await resolveHostThreadTitlePrompt(
          deps.getAgentStatuses,
          request.agentKind,
          threadLocation,
          request.prompt,
        ),
      ) ||
      "New thread";
    assertProjectScope();
    options.admitLaunch?.();

    const homeWorkspaceId =
      isHomeProjectId(project.id) && request.workspaceId ? request.workspaceId : undefined;
    const thread: Thread = {
      id: threadId,
      projectId: project.id,
      ...(homeWorkspaceId ? { workspaceId: homeWorkspaceId } : {}),
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
      ...(request.prNumber !== undefined ? { prNumber: request.prNumber } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
      activeTurnStartedAt: nowIso,
    };

    // New rows sort to the top via a descending timestamp (same convention as
    // the orchestrator bridge, schedules, and the remote-access server).
    deps.upsertThread(thread, -Date.now());
    persistedRow = true;

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
      ...(request.prNumber !== undefined ? { prNumber: request.prNumber } : {}),
      ...(createdWorktree ? { isNewWorktree: true } : {}),
      ...(homeWorkspaceId ? { workspaceId: homeWorkspaceId } : {}),
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

    await deps.startThread(startPayload);

    return {
      threadId,
      title,
      projectId: project.id,
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { branch } : {}),
    };
  } catch (error) {
    // Roll back this call's effects (follow the orchestrator/schedule bridge):
    // drop the fresh row and tell the renderer to forget it, but keep a
    // pre-existing row. Also remove a worktree WE created this call so a
    // retry isn't poisoned. A refusal raised by the admission gate lands here
    // with exactly the effects it already made.
    if (persistedRow && !existed) {
      deps.deleteThread(threadId);
      deps.sendThreadCommand({ kind: "delete", threadId });
    }
    if (createdWorktree && worktreePath) {
      await deps
        .removeWorktree({ location: project.location, path: worktreePath })
        .catch(() => undefined);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
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

/**
 * Validate the incoming selection as a complete known one before any effect.
 * The canonical complete-utility-selection schema is strict on purpose: a
 * mistyped control, an unknown field, or a future/unrecognized binding is
 * refused — never stripped and launched — while own empty/false carriers stay
 * exact. Reuses the existing localized unsupported-selection-data refusal.
 */
function parseLaunchSelection(request: CreateAppThreadRequest): ScheduledTaskConfig {
  const parsed = scheduledTaskConfigSchema.safeParse({
    model: request.model,
    ...(request.effort !== undefined ? { effort: request.effort } : {}),
    ...(request.fast !== undefined ? { fast: request.fast } : {}),
    ...(request.thinking !== undefined ? { thinking: request.thinking } : {}),
    ...(request.contextSize !== undefined ? { contextSize: request.contextSize } : {}),
    ...(request.selectionBinding !== undefined
      ? { selectionBinding: request.selectionBinding }
      : {}),
  });
  if (!parsed.success) {
    throw new Error(msg("modelSelection.unsupportedStoredData"));
  }
  return parsed.data;
}
