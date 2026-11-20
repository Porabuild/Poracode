import { randomUUID } from "node:crypto";
import {
  DEFAULT_TERMINAL_SIZE,
  resolveMcpLaunchSnapshot,
  mergeMcpServers,
  scheduledTaskConfigSchema,
  type AgentKind,
  type AgentStatusesResponse,
  type LoadedPlugin,
  type Project,
  type ProjectLocation,
  type PromptSegment,
  type RemoteThreadCommand,
  type ScheduledTaskConfig,
  type StartThreadPayload,
  type Thread,
  type ThreadConfig,
  type ThreadPresentationMode,
  type TerminalSize,
  type GitAddWorktreePayload,
  type GitAddWorktreeResult,
  type GitWorktreeInfo,
} from "@/shared/contracts";
import type { SelectionBinding } from "@/shared/selectionBinding.schemas";
import type { SharedSettings } from "@/shared/settings";
import { isHomeProjectId } from "@/shared/homeScope";
import { errorDetail, msg } from "@/shared/messages";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import { isThreadLaunchFailedRefusal } from "@/shared/threadLaunchRefusal";
import { isBuiltInToolPlugin, resolveInstalledPluginState } from "@/shared/plugins/catalog";
import {
  captureProjectExecutionScope,
  hasSameProjectExecutionScope,
} from "./projectExecutionScope";
import { resolveThreadInputSegments } from "./threadInputSegments";
import { makeThreadTitle, titlePromptFromSegments } from "@/shared/threadTitle";
import {
  threadWorktreeCreationOptions,
  type ThreadWorktreeCreation,
} from "@/shared/threadWorktreeLaunch";
import {
  buildWorktreeLocation,
  normalizeWorktreePathForComparison,
  resolveWorktreePlacement,
} from "@/shared/worktree";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import {
  resolveHostThreadTitlePrompt,
  resolveHostThreadLaunchDefaults,
} from "./threadLaunchConfig";

/** Host surface the launcher needs — the same main-side seams schedules use. */
export interface AppThreadLauncherDeps {
  /** Launch the child session in the supervisor (main → supervisor request). */
  startThread(payload: StartThreadPayload): Promise<unknown>;
  /** Cached agent detection for the given WSL distros (supervisor request). */
  getAgentStatuses(wslDistros: string[]): Promise<AgentStatusesResponse>;
  getPlugins(location: ProjectLocation): Promise<LoadedPlugin[]>;
  /** Create a linked checkout using the owning project's settings. */
  addWorktree(input: GitAddWorktreePayload): Promise<GitAddWorktreeResult>;
  listWorktrees(location: ProjectLocation): Promise<readonly GitWorktreeInfo[]>;
  resolveWorktreeBase?(project: Project): Promise<string | undefined>;
  prepareWorktree?(projectId: string, path: string, threadId: string): Promise<void>;
  /** Roll back a worktree created by a launch that then failed (best effort). */
  removeWorktree(input: {
    location: ProjectLocation;
    path: string;
    deleteBranch: boolean;
  }): Promise<void>;
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
  onUncertainLaunch?(threadId: string): void;
  now?: () => number;
  newId?: () => string;
}

/** Arguments accepted by the app-controls `create_thread` tool. */
export interface CreateAppThreadRequest {
  projectId: string;
  prompt: string;
  agentKind: AgentKind;
  agentInstanceId?: string;
  /** Exact config from the composer. Legacy automation can send selection fields instead. */
  config?: ThreadConfig;
  presentationMode?: ThreadPresentationMode;
  initialSize?: TerminalSize;
  segments?: PromptSegment[];
  model: string;
  effort?: string;
  fast?: boolean;
  /** Remaining actual selection controls; presence is exact — `false` is a value. */
  thinking?: boolean;
  contextSize?: string;
  /** Recognized selection binding riding along with the actual controls. */
  selectionBinding?: SelectionBinding;
  title?: string;
  worktree?: ThreadWorktreeCreation;
  existingWorktreePath?: string;
  expectedWorktreeBranch?: string;
  existingWorktree?: { path: string; branch: string };
  prNumber?: number;
  /** Home-thread workspace tag; ignored for real projects. */
  workspaceId?: string;
  browserMcp?: boolean;
  crossagentMcp?: boolean;
  chromeMcp?: boolean;
  computerUse?: boolean;
  mcpServers?: Record<string, boolean>;
  plugins?: Record<string, boolean>;
  attachments?: Array<Omit<Extract<PromptSegment, { kind: "attachment" }>, "kind">>;
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
  changesTransferred?: boolean;
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
  const selection = parseLaunchSelection(request.config ?? request);
  const project = resolveProject(deps, request.projectId);
  const threadId = (deps.newId ?? randomUUID)();
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  // Read shared settings once and flow the value to every consumer below
  // (worktree placement + the launch MCP snapshot).
  const settings = deps.getSharedSettings();
  const customServers = mergeMcpServers(settings.mcpServers, project.mcpServers ?? []);
  const mcpOverrides = request.config?.mcpServerOverrides ?? request.mcpServers;
  const pluginOverrides = request.config?.pluginOverrides ?? request.plugins;
  for (const id of Object.keys(mcpOverrides ?? {})) {
    if (!customServers.some((server) => server.id === id)) {
      throw new Error(`Unknown MCP server id: ${id}`);
    }
  }
  const plugins = pluginOverrides ? await deps.getPlugins(project.location) : [];
  const pluginMcpDefaults: Record<string, boolean> = {};
  for (const [name, enabled] of Object.entries(pluginOverrides ?? {})) {
    const plugin = plugins.find((entry) => entry.name === name);
    if (!plugin || !resolveInstalledPluginState(plugin, settings.installedPlugins)) {
      throw new Error(`Plugin is not installed: ${name}`);
    }
    if (isBuiltInToolPlugin(plugin)) {
      for (const id of plugin.poracode.builtInMcpServerIds) pluginMcpDefaults[id] = enabled;
    }
  }
  const suppliedSegments =
    request.segments ??
    request.attachments?.map((attachment) => ({ kind: "attachment" as const, ...attachment })) ??
    [];
  const segments = await resolveThreadInputSegments(suppliedSegments, request.prompt);
  const launchSettings = {
    ...settings,
    enabledMcpServers: {
      ...settings.enabledMcpServers,
      ...pluginMcpDefaults,
      ...(request.browserMcp !== undefined ? { browser: request.browserMcp } : {}),
      ...(request.crossagentMcp !== undefined ? { crossagents: request.crossagentMcp } : {}),
      ...(request.chromeMcp !== undefined ? { chrome: request.chromeMcp } : {}),
      ...(request.computerUse !== undefined ? { "computer-use": request.computerUse } : {}),
    },
  };
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
  let changesTransferred: boolean | undefined;
  let createdBranch = false;
  const existed = deps.threadExists(threadId);
  let persistedRow = false;
  let startDispatched = false;

  try {
    if (request.existingWorktreePath) {
      const caseInsensitive = project.location.kind === "windows";
      const expectedPath = normalizeWorktreePathForComparison(
        request.existingWorktreePath,
        caseInsensitive,
      );
      const registered = (await deps.listWorktrees(project.location)).find(
        (entry) =>
          !entry.isMain &&
          normalizeWorktreePathForComparison(entry.path, caseInsensitive) === expectedPath,
      );
      if (
        !registered ||
        (request.expectedWorktreeBranch && registered.branch !== request.expectedWorktreeBranch)
      ) {
        throw new Error(
          "The selected worktree or branch is not registered for this project. Check list_worktrees.",
        );
      }
      worktreePath = registered.path;
      branch = registered.branch === "detached" ? undefined : registered.branch;
    } else if (!request.existingWorktree && request.worktree) {
      const optionsForCheckout = request.worktree;
      createdBranch = optionsForCheckout.createBranch ?? true;
      branch = optionsForCheckout.branch?.trim();
      if (!branch && !createdBranch)
        throw new Error("A checkout of an existing branch needs a branch name.");
      branch ??= generateWorktreeBranch();
      let startPoint = optionsForCheckout.startPoint;
      if (
        startPoint === undefined &&
        createdBranch &&
        !optionsForCheckout.transferUncommitted &&
        deps.resolveWorktreeBase
      ) {
        startPoint = await deps.resolveWorktreeBase(project);
        options.admitLaunch?.();
      }
      assertProjectScope();
      const created = await deps.addWorktree(
        resolveAddWorktreeArgs(settings, project, {
          ...optionsForCheckout,
          branch,
          ...(startPoint ? { startPoint } : {}),
        }),
      );
      worktreePath = created.path;
      changesTransferred = created.changesTransferred;
      createdWorktree = true;
    }
    assertProjectScope();
    options.admitLaunch?.();

    const threadLocation = worktreePath
      ? buildWorktreeLocation(project.location, worktreePath)
      : project.location;

    const { presentationMode, config: launchDefaults } = await resolveHostThreadLaunchDefaults(
      deps.getAgentStatuses,
      request.agentKind,
      threadLocation,
      launchSettings,
      {
        ...(request.presentationMode !== undefined
          ? { presentationMode: request.presentationMode }
          : {}),
        unattended: !request.config,
      },
    );
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
      ...launchDefaults,
      ...request.config,
      ...(request.mcpServers !== undefined ? { mcpServerOverrides: request.mcpServers } : {}),
      ...(request.plugins !== undefined ? { pluginOverrides: request.plugins } : {}),
      ...(request.browserMcp === false ? { browserMcp: false } : {}),
      ...(request.crossagentMcp === false ? { crossagentMcp: false } : {}),
      ...(request.chromeMcp === false ? { chromeMcp: false } : {}),
      ...(request.computerUse === false ? { computerUse: false } : {}),
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
          titlePromptFromSegments(request.prompt, segments),
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
      ...(request.agentInstanceId ? { agentInstanceId: request.agentInstanceId } : {}),
      config,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode,
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
      ...(request.agentInstanceId ? { agentInstanceId: request.agentInstanceId } : {}),
      config,
      prompt: request.prompt,
      ...(segments.length > 0 ? { segments } : {}),
      ...(customTitle ? { title: customTitle } : {}),
      presentationMode,
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
      ...(request.agentInstanceId ? { agentInstanceId: request.agentInstanceId } : {}),
      config,
      prompt: request.prompt,
      ...(segments.length > 0 ? { segments } : {}),
      initialSize: request.initialSize ?? DEFAULT_TERMINAL_SIZE,
      presentationMode,
      ...resolveMcpLaunchSnapshot(settings, project, config.mcpServerOverrides),
    };

    startDispatched = true;
    await deps.startThread(startPayload);
    if (createdWorktree && worktreePath && deps.prepareWorktree) {
      await deps.prepareWorktree(project.id, worktreePath, threadId).catch(() => undefined);
    }

    return {
      threadId,
      title,
      projectId: project.id,
      ...(worktreePath ? { worktreePath } : {}),
      ...(branch ? { branch } : {}),
      ...(changesTransferred !== undefined ? { changesTransferred } : {}),
    };
  } catch (error) {
    if (
      startDispatched &&
      !isThreadLaunchFailedRefusal(error) &&
      !isHostResourceAdmissionRefusal(error)
    ) {
      // Losing the IPC reply can leave a running provider in this checkout.
      // Keep its durable identity and publish it even to clients with no renderer.
      deps.onUncertainLaunch?.(threadId);
      throw new Error(
        `Launch outcome is uncertain for thread ${threadId}. Check get_thread before retrying. ${errorDetail(error)}`,
        { cause: error },
      );
    }
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
        .removeWorktree({
          location: project.location,
          path: worktreePath,
          deleteBranch: createdBranch,
        })
        .catch(() => undefined);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** Apply the same copy policy and host/project placement as the composer. */
function resolveAddWorktreeArgs(
  settings: SharedSettings,
  project: Project,
  input: ThreadWorktreeCreation,
): GitAddWorktreePayload {
  const placement = resolveWorktreePlacement(settings, project.worktreeLocation, project.location);
  const copyIgnoredPatterns = project.scripts?.worktreeCopyPatterns;
  return {
    projectLocation: project.location,
    ...threadWorktreeCreationOptions(input),
    ...(placement.root ? { worktreeRoot: placement.root } : {}),
    ...(placement.omitRepoDir ? { worktreeOmitRepoDir: true } : {}),
    ...(copyIgnoredPatterns?.length ? { copyIgnoredPatterns } : {}),
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
function parseLaunchSelection(request: ScheduledTaskConfig): ScheduledTaskConfig {
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
