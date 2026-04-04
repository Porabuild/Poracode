import type {
  AgentStatus,
  CloseThreadPayload,
  DetectSetupScriptPayload,
  DetectSetupScriptResult,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  GenerateTitlePayload,
  GenerateTitleResult,
  GetAgentStatusesPayload,
  GetGitBranchesPayload,
  GetGitDiffBatchPayload,
  GetGitDiffPayload,
  GetGitStatusPayload,
  GitAddWorktreeResult,
  GitAddWorktreePayload,
  GitBranchListResult,
  GitCommitPayload,
  GitCommitResult,
  GitDiffBatchResult,
  GitDiffResult,
  GitFetchPayload,
  GitListWorktreesPayload,
  GitPullPayload,
  GitPushPayload,
  GitDeleteBranchPayload,
  GitGetWorktreeSourceBranchPayload,
  GitGetWorktreeSourceBranchResult,
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitRemoveWorktreePayload,
  GitRevertAllPayload,
  GitRevertPayload,
  GitStageAllPayload,
  GitStagePayload,
  GitStatusResult,
  GitSyncPayload,
  GitSyncResult,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  GitUnstageAllPayload,
  GitUnstagePayload,
  GitWorktreeListResult,
  ProjectLocation,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SessionRef,
  StartShellPayload,
  StartThreadPayload,
  StartThreadResult,
  ThreadServerRequestId,
  ThreadAttention,
  ThreadConfig,
  ThreadHistorySnapshot,
  ThreadRuntimeSnapshot,
  ThreadStatus,
  WriteTerminalPayload,
} from "./contracts";
import type { SharedSettings } from "./settings";

export type SupervisorRequest =
  | { id: string; type: "listWslDistros"; payload: Record<string, never> }
  | { id: string; type: "getAgentStatuses"; payload: GetAgentStatusesPayload }
  | { id: string; type: "getThreadSnapshots"; payload: Record<string, never> }
  | { id: string; type: "startThread"; payload: StartThreadPayload }
  | { id: string; type: "sendThreadInput"; payload: SendThreadInputPayload }
  | { id: string; type: "writeTerminal"; payload: WriteTerminalPayload }
  | { id: string; type: "resizeTerminal"; payload: ResizeTerminalPayload }
  | { id: string; type: "getThreadHistory"; payload: { threadId: string } }
  | { id: string; type: "resolveThreadServerRequest"; payload: ResolveThreadServerRequestPayload }
  | { id: string; type: "closeThread"; payload: CloseThreadPayload }
  | { id: string; type: "startShell"; payload: StartShellPayload }
  | { id: string; type: "getGitStatus"; payload: GetGitStatusPayload }
  | { id: string; type: "getGitDiff"; payload: GetGitDiffPayload }
  | { id: string; type: "getGitDiffBatch"; payload: GetGitDiffBatchPayload }
  | { id: string; type: "gitStage"; payload: GitStagePayload }
  | { id: string; type: "gitUnstage"; payload: GitUnstagePayload }
  | { id: string; type: "gitRevert"; payload: GitRevertPayload }
  | { id: string; type: "gitStageAll"; payload: GitStageAllPayload }
  | { id: string; type: "gitUnstageAll"; payload: GitUnstageAllPayload }
  | { id: string; type: "gitRevertAll"; payload: GitRevertAllPayload }
  | { id: string; type: "gitCommit"; payload: GitCommitPayload }
  | { id: string; type: "generateCommitMessage"; payload: GenerateCommitMessagePayload }
  | { id: string; type: "generateTitle"; payload: GenerateTitlePayload }
  | { id: string; type: "gitListBranches"; payload: GetGitBranchesPayload }
  | { id: string; type: "gitFetch"; payload: GitFetchPayload }
  | { id: string; type: "gitListWorktrees"; payload: GitListWorktreesPayload }
  | { id: string; type: "gitAddWorktree"; payload: GitAddWorktreePayload }
  | { id: string; type: "gitRemoveWorktree"; payload: GitRemoveWorktreePayload }
  | { id: string; type: "gitDeleteBranch"; payload: GitDeleteBranchPayload }
  | { id: string; type: "gitPull"; payload: GitPullPayload }
  | { id: string; type: "gitPush"; payload: GitPushPayload }
  | { id: string; type: "gitSync"; payload: GitSyncPayload }
  | {
      id: string;
      type: "gitGetWorktreeSourceBranch";
      payload: GitGetWorktreeSourceBranchPayload;
    }
  | { id: string; type: "gitMergeToSource"; payload: GitMergeToSourcePayload }
  | { id: string; type: "gitPullFromSource"; payload: GitPullFromSourcePayload }
  | { id: string; type: "searchProjectFiles"; payload: SearchProjectFilesPayload }
  | { id: string; type: "detectSetupScript"; payload: DetectSetupScriptPayload };

export type SupervisorReply =
  | { replyTo: string; ok: true; data: unknown }
  | { replyTo: string; ok: false; error: string };

export type SupervisorEvent =
  | { type: "thread-reset"; threadId: string }
  | { type: "thread-output"; threadId: string; data: string; outputLength: number }
  | {
      type: "thread-server-request";
      threadId: string;
      requestId: ThreadServerRequestId;
      method: string;
      params: unknown;
    }
  | {
      type: "thread-state";
      threadId: string;
      status: ThreadStatus;
      attention: ThreadAttention;
      config?: ThreadConfig;
      sessionRef?: SessionRef;
      canResumeWithConfig: boolean;
      errorMessage?: string;
    }
  | { type: "thread-exited"; threadId: string; exitCode: number | null }
  | { type: "windows-agent-statuses"; statuses: AgentStatus[] }
  | { type: "wsl-agent-statuses"; statuses: AgentStatus[] };

export type UpdateStatus =
  | { type: "checking" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | {
      type: "downloading";
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface WindowChromePayload {
  backgroundColor: string;
  symbolColor: string;
}

export interface LightcodeBridge {
  platform: NodeJS.Platform;
  pickFolder(defaultPath?: string): Promise<string | null>;
  pickFiles(options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string[] | null>;
  saveClipboardImage(payload: {
    threadId: string;
    data: Uint8Array;
    extension: string;
  }): Promise<string>;
  listWslDistros(): Promise<string[]>;
  getAgentStatuses(wslDistros?: string[]): Promise<AgentStatus[]>;
  getThreadSnapshots(): Promise<ThreadRuntimeSnapshot[]>;
  getThreadHistory(threadId: string): Promise<ThreadHistorySnapshot>;
  startThread(payload: StartThreadPayload): Promise<StartThreadResult>;
  sendThreadInput(payload: SendThreadInputPayload): Promise<void>;
  writeTerminal(payload: WriteTerminalPayload): Promise<void>;
  resizeTerminal(payload: ResizeTerminalPayload): Promise<void>;
  resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void>;
  closeThread(payload: CloseThreadPayload): Promise<void>;
  startShell(payload: StartShellPayload): Promise<void>;
  getGitStatus(payload: GetGitStatusPayload): Promise<GitStatusResult>;
  getGitDiff(payload: GetGitDiffPayload): Promise<GitDiffResult>;
  getGitDiffBatch(payload: GetGitDiffBatchPayload): Promise<GitDiffBatchResult>;
  gitStage(payload: GitStagePayload): Promise<void>;
  gitUnstage(payload: GitUnstagePayload): Promise<void>;
  gitRevert(payload: GitRevertPayload): Promise<void>;
  gitStageAll(payload: GitStageAllPayload): Promise<void>;
  gitUnstageAll(payload: GitUnstageAllPayload): Promise<void>;
  gitRevertAll(payload: GitRevertAllPayload): Promise<void>;
  gitCommit(payload: GitCommitPayload): Promise<GitCommitResult>;
  generateCommitMessage(
    payload: GenerateCommitMessagePayload,
  ): Promise<GenerateCommitMessageResult>;
  generateTitle(payload: GenerateTitlePayload): Promise<GenerateTitleResult>;
  gitListBranches(payload: GetGitBranchesPayload): Promise<GitBranchListResult>;
  gitFetch(payload: GitFetchPayload): Promise<void>;
  gitListWorktrees(payload: GitListWorktreesPayload): Promise<GitWorktreeListResult>;
  gitAddWorktree(payload: GitAddWorktreePayload): Promise<GitAddWorktreeResult>;
  gitRemoveWorktree(payload: GitRemoveWorktreePayload): Promise<void>;
  gitDeleteBranch(payload: GitDeleteBranchPayload): Promise<void>;
  gitPull(payload: GitPullPayload): Promise<void>;
  gitPush(payload: GitPushPayload): Promise<void>;
  gitSync(payload: GitSyncPayload): Promise<GitSyncResult>;
  gitGetWorktreeSourceBranch(
    payload: GitGetWorktreeSourceBranchPayload,
  ): Promise<GitGetWorktreeSourceBranchResult>;
  gitMergeToSource(payload: GitMergeToSourcePayload): Promise<GitMergeToSourceResult>;
  gitPullFromSource(payload: GitPullFromSourcePayload): Promise<GitPullFromSourceResult>;
  searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult>;
  detectSetupScript(payload: DetectSetupScriptPayload): Promise<DetectSetupScriptResult>;
  getSharedSettings(): Promise<SharedSettings>;
  setSharedSettings(settings: SharedSettings): Promise<void>;
  setWindowChrome(payload: WindowChromePayload): Promise<void>;
  onSupervisorEvent(listener: (event: SupervisorEvent) => void): () => void;
  checkForUpdate(): Promise<void>;
  startUpdateDownload(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  // Database
  dbGetProjects(): Promise<import("./contracts").Project[]>;
  dbGetThreads(): Promise<import("./contracts").Thread[]>;
  dbGetState(key: string): Promise<string | null>;
  dbSetState(key: string, value: string): Promise<void>;
  dbUpsertProject(project: import("./contracts").Project): Promise<void>;
  dbUpsertThread(thread: import("./contracts").Thread): Promise<void>;
  dbDeleteThread(threadId: string): Promise<void>;
  dbDeleteProject(projectId: string): Promise<void>;
  dbSyncAll(
    projects: import("./contracts").Project[],
    threads: import("./contracts").Thread[],
    viewJson: string,
  ): Promise<void>;
}

export interface AddProjectDraft {
  location: ProjectLocation;
  nameOverride?: string;
}
