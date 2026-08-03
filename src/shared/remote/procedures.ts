import type { IpcProcedureName } from "../ipc";
import type { RemoteAccessScope } from "./protocol";

export type RemoteProcedureOwner =
  | "none"
  | "projectLocation"
  | "worktreeLocation"
  | "location"
  | "runtime"
  | "optionalProjectLocation"
  | "skillLocations"
  | "thread"
  | "project"
  | "terminal";

interface RemoteProcedureSpec {
  readonly scope: RemoteAccessScope;
  readonly owner: RemoteProcedureOwner;
}

function read<const Owner extends RemoteProcedureOwner>(owner: Owner) {
  return { scope: "session:read" as const, owner };
}

function operate<const Owner extends RemoteProcedureOwner>(owner: Owner) {
  return { scope: "session:operate" as const, owner };
}

function manageProjects<const Owner extends RemoteProcedureOwner>(owner: Owner) {
  return { scope: "projects:manage" as const, owner };
}

/**
 * Supervisor procedures exposed through the generic remote passthrough. The
 * scope is enforced by the remote server; the owner tells reused renderer
 * controls which desktop must execute the operation.
 */
export const REMOTE_PROCEDURE_SPECS = {
  // Thread checkpoints / rollback
  rollbackThreadConversation: operate("thread"),
  createFileCheckpoint: operate("thread"),
  finalizeFileCheckpoint: operate("thread"),
  listFileCheckpoints: read("thread"),
  restoreFileCheckpoint: operate("thread"),
  subagentSubscribe: read("thread"),
  subagentUnsubscribe: read("thread"),
  stageThreadInput: operate("thread"),
  workflowGetRun: read("location"),
  workflowAgentChat: read("location"),

  // Skills and MCP
  scanSkills: read("optionalProjectLocation"),
  listSkillMarketplace: read("none"),
  setSkillEnabled: operate("optionalProjectLocation"),
  deleteSkill: operate("optionalProjectLocation"),
  importSkills: operate("skillLocations"),
  installMarketplaceSkill: operate("optionalProjectLocation"),
  discoverExternalMcpServers: read("optionalProjectLocation"),
  probeMcpServer: operate("optionalProjectLocation"),
  getMcpOauthStatus: read("optionalProjectLocation"),
  beginMcpServerOauth: operate("optionalProjectLocation"),
  waitMcpServerOauth: operate("optionalProjectLocation"),
  clearMcpServerOauth: operate("optionalProjectLocation"),

  // Project files
  searchProjectFiles: read("projectLocation"),
  listProjectTree: read("projectLocation"),
  browseHostDirectory: manageProjects("none"),
  searchProjectTree: read("projectLocation"),
  readProjectFile: read("projectLocation"),
  // Arbitrary absolute paths can reach host credentials and app data, so they
  // require project-management scope rather than the basic session read scope.
  readAbsoluteFile: manageProjects("projectLocation"),
  readExternalFile: manageProjects("projectLocation"),
  writeProjectFile: operate("projectLocation"),
  writeExternalFile: manageProjects("projectLocation"),
  createProjectEntry: operate("projectLocation"),
  renameProjectEntry: operate("projectLocation"),
  moveProjectEntry: operate("projectLocation"),
  deleteProjectEntry: operate("projectLocation"),
  detectSetupScript: read("projectLocation"),

  // Git and GitHub reads
  getGitStatus: read("projectLocation"),
  getGitDiff: read("projectLocation"),
  getGitDiffBatch: read("projectLocation"),
  getGitFileContent: read("projectLocation"),
  gitListBranches: read("projectLocation"),
  gitListWorktrees: read("projectLocation"),
  gitProjectSnapshot: read("projectLocation"),
  gitWorktreeStatusBatch: read("projectLocation"),
  gitGetWorktreeSourceBranch: read("projectLocation"),
  gitGetWorktreeOwner: read("projectLocation"),
  ghCheckAvailable: read("projectLocation"),
  ghGetPrForBranch: read("projectLocation"),
  ghListPrs: read("projectLocation"),
  ghListPullRequests: read("projectLocation"),
  ghGetPrChecks: read("projectLocation"),
  ghGetPrFiles: read("projectLocation"),
  ghGetPrDiff: read("projectLocation"),
  ghGetPrDetails: read("projectLocation"),
  ghGetPrReviewComments: read("projectLocation"),
  ghListAccounts: read("runtime"),
  ghListRepos: read("runtime"),
  ghListWorkflows: read("projectLocation"),
  ghListWorkflowRuns: read("projectLocation"),
  ghGetWorkflowRun: read("projectLocation"),
  ghGetWorkflowDefinition: read("projectLocation"),

  // Working-tree + index mutations
  gitStage: operate("projectLocation"),
  gitUnstage: operate("projectLocation"),
  gitRevert: operate("projectLocation"),
  gitStageAll: operate("projectLocation"),
  gitUnstageAll: operate("projectLocation"),
  gitRevertAll: operate("projectLocation"),
  gitCommit: operate("projectLocation"),
  gitInit: operate("projectLocation"),
  gitAddRemote: operate("projectLocation"),
  generateCommitMessage: operate("projectLocation"),
  generateTitle: operate("projectLocation"),
  generatePrSummary: operate("projectLocation"),

  // Sync / branches / worktrees
  gitFetch: operate("projectLocation"),
  gitPull: operate("projectLocation"),
  gitPullRebase: operate("projectLocation"),
  gitPush: operate("projectLocation"),
  gitSync: operate("projectLocation"),
  gitSyncRebase: operate("projectLocation"),
  gitSwitchBranch: operate("projectLocation"),
  gitDeleteBranch: operate("projectLocation"),
  gitAddWorktree: operate("projectLocation"),
  gitRemoveWorktree: operate("projectLocation"),
  gitPruneWorktrees: operate("projectLocation"),
  gitMergeToSource: operate("projectLocation"),
  gitPullFromSource: operate("worktreeLocation"),
  gitAbortMerge: operate("worktreeLocation"),
  gitFinishMerge: operate("worktreeLocation"),

  // Pull-request mutations
  ghCreatePr: operate("projectLocation"),
  ghMergePr: operate("projectLocation"),
  ghClosePr: operate("projectLocation"),
  ghReopenPr: operate("projectLocation"),
  ghMarkPrReady: operate("projectLocation"),
  ghSubmitPrReview: operate("projectLocation"),
  ghUpdatePrBranch: operate("projectLocation"),
  ghPostPrComment: operate("projectLocation"),
  ghDispatchWorkflow: operate("projectLocation"),
  ghRerunWorkflowRun: operate("projectLocation"),
  ghCancelWorkflowRun: operate("projectLocation"),
  ghDeleteWorkflowRun: operate("projectLocation"),
} as const satisfies Partial<Record<IpcProcedureName, RemoteProcedureSpec>>;

export type RemoteProcedureName = keyof typeof REMOTE_PROCEDURE_SPECS;

/** Renderer procedures that become no-ops when their owner is remote. */
export const REMOTE_NOOP_PROCEDURES = {
  gitWatchProject: "projectLocation",
  gitWatchWorktrees: "project",
  gitUnwatchProject: "project",
  revealProjectEntry: "projectLocation",
} as const satisfies Partial<Record<IpcProcedureName, RemoteProcedureOwner>>;

export type RemoteNoopProcedureName = keyof typeof REMOTE_NOOP_PROCEDURES;

export function isRemoteProcedure(name: string): name is RemoteProcedureName {
  return Object.hasOwn(REMOTE_PROCEDURE_SPECS, name);
}

export function isRemoteNoopProcedure(name: string): name is RemoteNoopProcedureName {
  return Object.hasOwn(REMOTE_NOOP_PROCEDURES, name);
}
