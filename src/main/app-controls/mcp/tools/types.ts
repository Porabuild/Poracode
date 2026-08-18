import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import { normalizeWorktreePathForComparison, resolveProjectLocation } from "@/shared/worktree";
import type {
  AgentStatusesResponse,
  ClearPendingSteerPayload,
  CloseThreadPayload,
  GetAgentStatusesPayload,
  GetGitBranchesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitStatusPayload,
  GhCheckAvailableResult,
  GhClosePrPayload,
  GhCreatePrPayload,
  GhGetPrChecksPayload,
  GhGetPrChecksResult,
  GhGetPrDetailsPayload,
  GhGetPrDetailsResult,
  GhGetPrDiffPayload,
  GhGetPrDiffResult,
  GhGetPrFilesPayload,
  GhGetPrFilesResult,
  GhListPullRequestsPayload,
  GhListPullRequestsResult,
  GhMarkPrReadyPayload,
  GhMergePrPayload,
  GhPostPrCommentPayload,
  GhReopenPrPayload,
  GhUpdatePrBranchPayload,
  GitAbortMergePayload,
  GitAbortMergeResult,
  GitBranchListResult,
  GitCommitPayload,
  GitCommitResult,
  GitDiffBatchResult,
  GitDiffResult,
  GitFetchPayload,
  GitFinishMergePayload,
  GitFinishMergeResult,
  GitGetWorktreeSourceBranchPayload,
  GitGetWorktreeSourceBranchResult,
  GitListWorktreesPayload,
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitProjectSnapshotPayload,
  GitProjectSnapshotResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitPullPayload,
  GitPushPayload,
  GitRemoveWorktreePayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitSwitchBranchPayload,
  GitSwitchBranchResult,
  GitUnstageAllPayload,
  GitUnstagePayload,
  GitWorktreeInfo,
  GitWorktreeListResult,
  GitWorktreeStatusBatchPayload,
  GitWorktreeStatusBatchResult,
  InterruptThreadPayload,
  ListProjectTreePayload,
  ListProjectTreeResult,
  McpOauthStatusResult,
  McpProbePayload,
  McpProbeResult,
  PrComment,
  PrData,
  Project,
  ProjectLocation,
  ProjectNotes,
  ProviderUsagePayload,
  ProviderUsageResponse,
  ReadProjectFilePayload,
  ReadProjectFileResult,
  ReloadAgentMcpServersPayload,
  RemoteThreadCommand,
  RollbackThreadConversationPayload,
  ScanSkillsPayload,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  SearchProjectTreePayload,
  SearchProjectTreeResult,
  SendThreadInputPayload,
  SetPendingSteerPayload,
  SetSkillEnabledPayload,
  SkillScanResult,
  StageThreadInputPayload,
  StartThreadPayload,
  StartThreadResult,
  Thread,
  ThreadRuntimeSnapshot,
  TerminalShellSnapshot,
} from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import type { StreamableHttpMcpToolSpec } from "../../../mcp/StreamableHttpMcpIngress";
import type { ScheduleService } from "../../../schedules/ScheduleService";
import type {
  CreateAppThreadRequest,
  CreateAppThreadResult,
} from "../../../threads/appThreadLauncher";
import type { ThreadStateBroker } from "../../../threads/threadStateBroker";

/**
 * Typed subset of `supervisorClient.call` the thread-management tools use. Kept
 * to the handful of thread RPCs the domain needs so the tool layer never sees
 * the full supervisor procedure surface.
 */
export interface AppControlsSupervisorCaller {
  getThreadSnapshots(): Promise<ThreadRuntimeSnapshot[]>;
  getTerminalShellSnapshots(): Promise<TerminalShellSnapshot[]>;
  /** Start (or resume) a thread's runtime session. Used to revive a thread with no live session. */
  startThread(payload: StartThreadPayload): Promise<StartThreadResult>;
  sendThreadInput(payload: SendThreadInputPayload): Promise<void>;
  interruptThread(payload: InterruptThreadPayload): Promise<void>;
  closeThread(payload: CloseThreadPayload): Promise<void>;
  getProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse>;
  refreshProviderUsage(payload: ProviderUsagePayload): Promise<ProviderUsageResponse>;
  searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult>;
  /** Read a terminal PTY's scrollback (empty string when none). */
  readTerminalScrollback(payload: { threadId: string }): Promise<string>;
  /** Queue steer guidance injected when the running agent next yields. */
  setPendingSteer(payload: SetPendingSteerPayload): Promise<void>;
  /** Clear a thread's queued steer guidance. */
  clearPendingSteer(payload: ClearPendingSteerPayload): Promise<void>;
  /** Type text into a terminal thread's composer without submitting it. */
  stageThreadInput(payload: StageThreadInputPayload): Promise<void>;
  /** Permanently discard the last N turns of a thread's conversation. */
  rollbackThreadConversation(payload: RollbackThreadConversationPayload): Promise<void>;
  /** Cached installed-agent inventory across native + WSL environments. */
  getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse>;
  /** Force a fresh detection sweep of installed agents. */
  refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse>;
  /** List one directory level of a project's file tree. */
  listProjectTree(payload: ListProjectTreePayload): Promise<ListProjectTreeResult>;
  /** Read a single project file's contents. */
  readProjectFile(payload: ReadProjectFilePayload): Promise<ReadProjectFileResult>;
  /** Fuzzy filename search within a project. */
  searchProjectTree(payload: SearchProjectTreePayload): Promise<SearchProjectTreeResult>;
  /** Combined status/branches/worktrees snapshot for a project or worktree. */
  gitProjectSnapshot(payload: GitProjectSnapshotPayload): Promise<GitProjectSnapshotResult>;
  /** Unified diff for one file (staged or working tree). */
  getGitDiff(payload: GetGitDiffPayload): Promise<GitDiffResult>;
  /** Unified diffs for every changed file, keyed by path. */
  getGitDiffBatch(payload: GetGitDiffBatchPayload): Promise<GitDiffBatchResult>;
  /** Stage one path. */
  gitStage(payload: GitStagePayload): Promise<void>;
  /** Unstage one path. */
  gitUnstage(payload: GitUnstagePayload): Promise<void>;
  /** Stage every change. */
  gitStageAll(payload: GitStageAllPayload): Promise<void>;
  /** Unstage every change. */
  gitUnstageAll(payload: GitUnstageAllPayload): Promise<void>;
  /** Discard uncommitted changes to one path (destructive). */
  gitRevert(payload: GitRevertPayload): Promise<void>;
  /** Discard all uncommitted changes (destructive). */
  gitRevertAll(payload: GitRevertAllPayload): Promise<void>;
  /** Create a commit. */
  gitCommit(payload: GitCommitPayload): Promise<GitCommitResult>;
  /** List local (and optionally remote) branches. */
  gitListBranches(payload: GetGitBranchesPayload): Promise<GitBranchListResult>;
  /** Switch to (or create) a branch. */
  gitSwitchBranch(payload: GitSwitchBranchPayload): Promise<GitSwitchBranchResult>;
  /** Fetch from a remote. */
  gitFetch(payload: GitFetchPayload): Promise<void>;
  /** Pull (merge) from the tracking remote. */
  gitPull(payload: GitPullPayload): Promise<void>;
  /** Pull with rebase from the tracking remote. */
  gitPullRebase(payload: GitPullPayload): Promise<void>;
  /** Push commits to a remote (publishes work). */
  gitPush(payload: GitPushPayload): Promise<void>;
  /** List a project's git worktrees. */
  gitListWorktrees(payload: GitListWorktreesPayload): Promise<GitWorktreeListResult>;
  /** Remove a worktree directory (destructive). */
  gitRemoveWorktree(payload: GitRemoveWorktreePayload): Promise<void>;
  /** Batch status for several worktree paths. */
  gitWorktreeStatusBatch(
    payload: GitWorktreeStatusBatchPayload,
  ): Promise<GitWorktreeStatusBatchResult>;
  /** Resolve a worktree branch's inferred source branch + ahead counts. */
  gitGetWorktreeSourceBranch(
    payload: GitGetWorktreeSourceBranchPayload,
  ): Promise<GitGetWorktreeSourceBranchResult>;
  /** Merge a worktree branch into its source branch. */
  gitMergeToSource(payload: GitMergeToSourcePayload): Promise<GitMergeToSourceResult>;
  /** Pull the source branch into a worktree. */
  gitPullFromSource(payload: GitPullFromSourcePayload): Promise<GitPullFromSourceResult>;
  /** Abort an in-progress merge in a worktree. */
  gitAbortMerge(payload: GitAbortMergePayload): Promise<GitAbortMergeResult>;
  /** Finish (commit) a resolved merge in a worktree. */
  gitFinishMerge(payload: GitFinishMergePayload): Promise<GitFinishMergeResult>;
  /** Check whether the `gh` CLI is available for a project's runtime. */
  ghCheckAvailable(payload: GetGitStatusPayload): Promise<GhCheckAvailableResult>;
  /** List a project's pull requests. */
  ghListPullRequests(payload: GhListPullRequestsPayload): Promise<GhListPullRequestsResult>;
  /** Read a pull request's details. */
  ghGetPrDetails(payload: GhGetPrDetailsPayload): Promise<GhGetPrDetailsResult>;
  /** Read a pull request's CI checks (by head branch). */
  ghGetPrChecks(payload: GhGetPrChecksPayload): Promise<GhGetPrChecksResult>;
  /** List a pull request's changed files. */
  ghGetPrFiles(payload: GhGetPrFilesPayload): Promise<GhGetPrFilesResult>;
  /** Read a pull request's unified diff. */
  ghGetPrDiff(payload: GhGetPrDiffPayload): Promise<GhGetPrDiffResult>;
  /** Create a pull request (publishes it). */
  ghCreatePr(payload: GhCreatePrPayload): Promise<PrData>;
  /** Post a comment on a pull request. */
  ghPostPrComment(payload: GhPostPrCommentPayload): Promise<PrComment>;
  /** Merge a pull request. */
  ghMergePr(payload: GhMergePrPayload): Promise<void>;
  /** Close a pull request. */
  ghClosePr(payload: GhClosePrPayload): Promise<void>;
  /** Reopen a closed pull request. */
  ghReopenPr(payload: GhReopenPrPayload): Promise<void>;
  /** Mark a draft pull request ready for review. */
  ghMarkPrReady(payload: GhMarkPrReadyPayload): Promise<void>;
  /** Update a pull request's branch with its base. */
  ghUpdatePrBranch(payload: GhUpdatePrBranchPayload): Promise<void>;
  /** Probe a candidate MCP server config for reachability + tools. */
  probeMcpServer(payload: McpProbePayload): Promise<McpProbeResult>;
  /** Re-resolve + apply an agent kind's MCP set to its live sessions (hot-reload). */
  reloadAgentMcpServers(payload: ReloadAgentMcpServersPayload): Promise<void>;
  /** OAuth authentication status for configured MCP servers. */
  getMcpOauthStatus(): Promise<McpOauthStatusResult>;
  /** Scan installed skills (global + optional project scope). */
  scanSkills(payload: ScanSkillsPayload): Promise<SkillScanResult>;
  /** Enable or disable one skill. */
  setSkillEnabled(payload: SetSkillEnabledPayload): Promise<void>;
}

/** Result of the renderer-owned OS-notification callback (honest headless fallback). */
export interface AppControlsNotifyResult {
  /** True only when an OS notification was actually shown. */
  delivered: boolean;
  /** Explains why nothing was shown when `delivered` is false. */
  note?: string;
}

/** Result of the desktop-only update-check callback. */
export interface AppControlsUpdateCheck {
  /** True when an updater is available (desktop); false headless / dev. */
  supported: boolean;
  /** The running app version. */
  currentVersion?: string;
  /** Most recent known updater status type (may predate this call). */
  status?: string;
  /** Version offered by the most recent known check, when one is available. */
  availableVersion?: string;
  note?: string;
}

/** Read-only app facts surfaced by `get_app_info`; injected so tools stay pure. */
export interface AppControlsAppInfo {
  /** App version (Electron `app.getVersion()` on desktop, package version headless). */
  version: string;
  /** Host platform (`process.platform`). */
  platform: string;
  /** True on desktop with a live renderer window; false for a headless server. */
  hasRendererWindow: boolean;
}

/** Read + guarded-write access to the shared settings file (source of truth). */
export interface AppControlsSettingsGateway {
  /** Full, normalized settings from disk. */
  read(): SharedSettings;
  /**
   * Persist a full settings object and broadcast the change the same way a
   * normal settings save does (renderer IPC + power-save refresh on desktop).
   * The caller has already applied `mergeManagedSharedSettings` guards.
   */
  write(next: SharedSettings): void;
}

/** Everything a tool handler needs to act on the app on the caller's behalf. */
export interface AppControlsToolContext {
  /** Calling thread + its task title, decoded from the MCP endpoint URL. */
  identity: McpThreadIdentity;
  scheduleService: ScheduleService;
  getThread(threadId: string): Thread | null;
  getThreads(): Thread[];
  getProjects(): Project[];
  getProject(projectId: string): Project | null;
  /** Per-project notes (doc + todos), or null when none are recorded. */
  getProjectNotes(projectId: string): ProjectNotes | null;
  /** True when `path` resolves to an existing directory on disk. */
  directoryExists(path: string): boolean;
  /**
   * Run a project command (add-existing/remove) through the shared remote
   * project-command handler and notify listeners exactly as the remote
   * `/api/projects/command` route does.
   */
  applyProjectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult>;
  /** Persist an edited project row (e.g. rename) and notify project-change listeners. */
  updateProject(project: Project): void;
  /** Shared settings read + guarded write (used by get_settings / update_settings). */
  settings: AppControlsSettingsGateway;
  /** Read-only app facts for `get_app_info`. */
  getAppInfo(): AppControlsAppInfo;
  supervisor: AppControlsSupervisorCaller;
  /** Create + launch a first-class app thread (see appThreadLauncher). */
  createThread(request: CreateAppThreadRequest): Promise<CreateAppThreadResult>;
  /**
   * Forward a metadata mutation to the renderer-owned thread store. Returns
   * `true` when a renderer received it, `false` when no UI is connected (e.g. a
   * headless host, or the desktop main window is closed) — the caller then
   * falls back to writing the DB row directly via {@link updateThreadRow}.
   */
  emitRemoteThreadCommand(command: RemoteThreadCommand): boolean;
  /**
   * Headless / no-renderer fallback: read the current thread row, apply
   * `mutate`, and persist it (preserving sort order). Source of truth when no
   * renderer store is present. No-op when the thread row no longer exists.
   */
  updateThreadRow(threadId: string, mutate: (thread: Thread) => Thread): void;
  /** Ask the renderer to open/focus a thread in the UI. Returns `false` when no UI is connected. */
  openThreadInUi(threadId: string): boolean;
  /**
   * Show an OS notification to the user. Desktop-only: the headless host has no
   * display, so it reports non-delivery instead of silently succeeding.
   */
  notifyUser(input: { title: string; body: string; threadId: string }): AppControlsNotifyResult;
  /**
   * Trigger the desktop app's update check (read-only). Headless / dev report a
   * clear not-supported result rather than pretending to check.
   */
  checkForUpdate(): Promise<AppControlsUpdateCheck>;
  /** Live status cache + event-driven wait surface (persistent, ingress-owned). */
  threadStates: ThreadStateBroker;
}

/** One tool's handler; receives validated raw args and the request context. */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: AppControlsToolContext,
) => Promise<unknown> | unknown;

/** A self-contained group of tools (specs + dispatch handlers) for one domain. */
export interface ToolDomain {
  specs: readonly StreamableHttpMcpToolSpec[];
  handlers: Record<string, ToolHandler>;
}

/** Resolve a threadId arg to a DB row, or throw a clear not-found error. */
export function requireThread(ctx: AppControlsToolContext, threadId: string): Thread {
  const thread = ctx.getThread(threadId);
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}. Call list_threads to see valid thread ids.`);
  }
  return thread;
}

/**
 * Reject actions that would deadlock the calling thread against itself (a
 * thread cannot stop/interrupt/wait on its own running turn — it is the turn).
 */
export function assertNotSelf(ctx: AppControlsToolContext, threadId: string, action: string): void {
  if (ctx.identity.threadId && ctx.identity.threadId === threadId) {
    throw new Error(
      `You cannot ${action} your own thread — it is the thread making this call, so the action ` +
        "would deadlock. Target a different thread.",
    );
  }
}

/** Resolve a projectId to its DB row, or throw a clear not-found error. */
export function requireProject(ctx: AppControlsToolContext, projectId: string): Project {
  const project = ctx.getProject(projectId);
  if (!project) {
    throw new Error(
      `Project not found: ${projectId}. Call list_projects to see valid project ids.`,
    );
  }
  return project;
}

/**
 * Resolve a projectId (+ optional worktreePath) to the effective on-disk
 * location, rejecting any worktreePath outside the project's worktree set so
 * every tool that accepts one stays project-scoped.
 */
export async function resolveLocation(
  ctx: AppControlsToolContext,
  projectId: string,
  worktreePath: string | undefined,
): Promise<ProjectLocation> {
  const projectLocation = requireProject(ctx, projectId).location;
  if (worktreePath !== undefined) {
    await resolveWorktreeInfo(ctx, projectLocation, worktreePath);
  }
  return resolveProjectLocation(projectLocation, worktreePath);
}

/** Find a worktree's branch + head commit from the project's worktree list. */
export async function resolveWorktreeInfo(
  ctx: AppControlsToolContext,
  location: ProjectLocation,
  worktreePath: string,
): Promise<GitWorktreeInfo> {
  const { worktrees } = await ctx.supervisor.gitListWorktrees({ projectLocation: location });
  const target = normalizeWorktreePathForComparison(worktreePath, false);
  const match = worktrees.find(
    (worktree) => normalizeWorktreePathForComparison(worktree.path, false) === target,
  );
  if (!match) {
    throw new Error(
      `No worktree found at ${worktreePath}. Call list_worktrees to see the project's worktrees.`,
    );
  }
  return match;
}

/** Shared cap on diff/PR-diff text returned to the caller (across all files). */
export const DIFF_MAX_CHARS = 80_000;

/** Truncate diff text to the shared cap, flagging when it was cut. */
export function capDiff(diff: string): { diff: string; truncated?: true; note?: string } {
  if (diff.length <= DIFF_MAX_CHARS) return { diff };
  return {
    diff: diff.slice(0, DIFF_MAX_CHARS),
    truncated: true,
    note: `Diff truncated to the first ${DIFF_MAX_CHARS} characters.`,
  };
}

/** Shared JSON-schema property fragments spread into tool input specs. */
export const projectIdProp = { type: "string" };
export const worktreePathProp = { type: "string", minLength: 1 };
export const threadIdProp = { type: "string" };
