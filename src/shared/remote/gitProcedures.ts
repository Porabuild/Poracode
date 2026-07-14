import type { RemoteAccessScope } from "./protocol";

/**
 * The supervisor procedures the remote PWA is allowed to invoke
 * through the generic `POST /api/git/call` passthrough, mapped to the access
 * scope each one requires. Reads need `session:read`; anything that mutates the
 * working tree, branches, or a PR needs `session:operate`.
 *
 * The desktop git-review components (GitReviewSidebar, SingleFileDiff,
 * PrSection, PrReviewOverlay, …) reuse these procedures verbatim via the bridge
 * shim; the mobile file tree/editor does the same for project-tree procedures.
 * Watchers are handled separately (see GIT_REMOTE_NOOP_PROCEDURES) — they set
 * up desktop file-system watchers that have no meaning for a remote client.
 */
export const GIT_REMOTE_PROCEDURE_SCOPES = {
  // Thread checkpoints / rollback
  rollbackThreadConversation: "session:operate",
  createFileCheckpoint: "session:operate",
  finalizeFileCheckpoint: "session:operate",
  listFileCheckpoints: "session:read",
  restoreFileCheckpoint: "session:operate",
  subagentSubscribe: "session:read",
  subagentUnsubscribe: "session:read",
  workflowGetRun: "session:read",

  // Project files
  searchProjectFiles: "session:read",
  listProjectTree: "session:read",
  // Host folder picker (add-existing / clone parent) — same capability that can
  // already register any absolute path as a project, so gated behind that scope.
  browseHostDirectory: "projects:manage",
  searchProjectTree: "session:read",
  readProjectFile: "session:read",
  // Reads an arbitrary absolute path as-is (even outside any project root), so
  // it can reach ~/.ssh/id_rsa, ~/.aws/credentials, the server DB, etc. Gated
  // behind the same scope as browseHostDirectory and remote project management
  // rather than the lowest read scope. `projects:manage` is part of the
  // standard scope set granted at pairing, so normal project file opens are
  // unaffected; project-relative reads use readProjectFile (session:read).
  readAbsoluteFile: "projects:manage",
  writeProjectFile: "session:operate",
  createProjectEntry: "session:operate",
  renameProjectEntry: "session:operate",
  moveProjectEntry: "session:operate",
  deleteProjectEntry: "session:operate",

  // Reads
  getGitStatus: "session:read",
  getGitDiff: "session:read",
  getGitDiffBatch: "session:read",
  getGitFileContent: "session:read",
  gitListBranches: "session:read",
  gitListWorktrees: "session:read",
  gitProjectSnapshot: "session:read",
  gitWorktreeStatusBatch: "session:read",
  gitGetWorktreeSourceBranch: "session:read",
  ghCheckAvailable: "session:read",
  ghGetPrForBranch: "session:read",
  ghListPrs: "session:read",
  ghListPullRequests: "session:read",
  ghGetPrChecks: "session:read",
  ghGetPrFiles: "session:read",
  ghGetPrDiff: "session:read",
  ghGetPrDetails: "session:read",

  // Working-tree + index mutations
  gitStage: "session:operate",
  gitUnstage: "session:operate",
  gitRevert: "session:operate",
  gitStageAll: "session:operate",
  gitUnstageAll: "session:operate",
  gitRevertAll: "session:operate",
  gitCommit: "session:operate",
  gitInit: "session:operate",
  gitAddRemote: "session:operate",

  // AI helpers (run on the paired desktop's providers)
  generateCommitMessage: "session:operate",
  generateTitle: "session:operate",
  generatePrSummary: "session:operate",

  // Sync / branches / worktrees
  gitFetch: "session:operate",
  gitPull: "session:operate",
  gitPullRebase: "session:operate",
  gitPush: "session:operate",
  gitSync: "session:operate",
  gitSyncRebase: "session:operate",
  gitSwitchBranch: "session:operate",
  gitDeleteBranch: "session:operate",
  gitAddWorktree: "session:operate",
  gitRemoveWorktree: "session:operate",
  gitPruneWorktrees: "session:operate",
  gitMergeToSource: "session:operate",
  gitPullFromSource: "session:operate",
  gitAbortMerge: "session:operate",
  gitFinishMerge: "session:operate",

  // Pull-request mutations
  ghCreatePr: "session:operate",
  ghMergePr: "session:operate",
  ghClosePr: "session:operate",
  ghReopenPr: "session:operate",
  ghMarkPrReady: "session:operate",
  ghSubmitPrReview: "session:operate",
  ghUpdatePrBranch: "session:operate",
  ghPostPrComment: "session:operate",
} as const satisfies Record<string, RemoteAccessScope>;

export type GitRemoteProcedureName = keyof typeof GIT_REMOTE_PROCEDURE_SCOPES;

/**
 * Watcher procedures the desktop components call (e.g. on manual refresh) that
 * the bridge resolves to a no-op for remote clients: the desktop already keeps
 * its own watchers running, and the PWA receives live updates over the
 * WebSocket (git summaries) plus on-demand refreshes.
 */
export const GIT_REMOTE_NOOP_PROCEDURES = [
  "gitWatchProject",
  "gitWatchWorktrees",
  "gitUnwatchProject",
] as const;

export type GitRemoteNoopProcedureName = (typeof GIT_REMOTE_NOOP_PROCEDURES)[number];

const noopSet: ReadonlySet<string> = new Set(GIT_REMOTE_NOOP_PROCEDURES);

export function isGitRemoteProcedure(name: string): name is GitRemoteProcedureName {
  return Object.hasOwn(GIT_REMOTE_PROCEDURE_SCOPES, name);
}

export function isGitRemoteNoopProcedure(name: string): name is GitRemoteNoopProcedureName {
  return noopSet.has(name);
}
