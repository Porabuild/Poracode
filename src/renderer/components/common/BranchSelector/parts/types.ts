export interface BranchSelection {
  branch: string;
  baseBranch?: string;
  isWorktree: boolean;
  worktreePath?: string;
  /** Carry the main checkout's uncommitted changes into the new worktree. */
  transferUncommitted?: boolean;
}
