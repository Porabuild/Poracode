import { create } from "zustand";
import type { GitBranchListResult, GitStatusResult, GitWorktreeInfo, PrData } from "../../shared/contracts";

export interface WorktreeSourceInfo {
  sourceBranch: string | null;
  commitsAhead: number;
  sourceAhead: number;
}

interface GitState {
  statuses: Record<string, GitStatusResult>;
  worktreeStatuses: Record<string, GitStatusResult>;
  worktrees: Record<string, GitWorktreeInfo[]>;
  branches: Record<string, GitBranchListResult>;
  ghAvailable: Record<string, boolean>;
  prData: Record<string, PrData | null>;
  worktreeSourceInfo: Record<string, WorktreeSourceInfo>;
}

interface GitProjectSnapshot {
  status?: GitStatusResult;
  branches?: GitBranchListResult;
  worktrees?: GitWorktreeInfo[];
  ghAvailable?: boolean;
}

interface GitActions {
  setStatus: (projectId: string, status: GitStatusResult) => void;
  clearStatus: (projectId: string) => void;
  setWorktreeStatus: (worktreePath: string, status: GitStatusResult) => void;
  setWorktreeStatuses: (statuses: Record<string, GitStatusResult>) => void;
  clearWorktreeStatus: (worktreePath: string) => void;
  setWorktrees: (projectId: string, worktrees: GitWorktreeInfo[]) => void;
  setBranches: (projectId: string, branches: GitBranchListResult) => void;
  setProjectSnapshot: (projectId: string, snapshot: GitProjectSnapshot) => void;
  setGhAvailable: (projectId: string, available: boolean) => void;
  setPrData: (worktreePath: string, pr: PrData | null) => void;
  setPrDataBatch: (entries: Record<string, PrData | null>) => void;
  setWorktreeSourceInfo: (worktreePath: string, info: WorktreeSourceInfo) => void;
  setWorktreeSourceInfoBatch: (entries: Record<string, WorktreeSourceInfo>) => void;
}

function areStringArraysEqual(a: readonly string[] | undefined, b: readonly string[] | undefined) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areStatusFilesEqual(a: GitStatusResult["staged"], b: GitStatusResult["staged"]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.path !== right.path ||
      left.oldPath !== right.oldPath ||
      left.status !== right.status ||
      left.staged !== right.staged ||
      left.insertions !== right.insertions ||
      left.deletions !== right.deletions
    ) {
      return false;
    }
  }
  return true;
}

function areGitStatusesEqual(a: GitStatusResult | undefined, b: GitStatusResult) {
  if (a === b) return true;
  if (!a) return false;
  const leftRemote = a.remoteInfo;
  const rightRemote = b.remoteInfo;
  return (
    a.isRepo === b.isRepo &&
    a.branch === b.branch &&
    a.tracking === b.tracking &&
    a.hasRemote === b.hasRemote &&
    ((leftRemote === null && rightRemote === null) ||
      (leftRemote !== null &&
        rightRemote !== null &&
        leftRemote.url === rightRemote.url &&
        leftRemote.platform === rightRemote.platform &&
        leftRemote.owner === rightRemote.owner &&
        leftRemote.repo === rightRemote.repo)) &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.totalInsertions === b.totalInsertions &&
    a.totalDeletions === b.totalDeletions &&
    a.mergeInProgress === b.mergeInProgress &&
    areStringArraysEqual(a.conflictFiles, b.conflictFiles) &&
    areStatusFilesEqual(a.staged, b.staged) &&
    areStatusFilesEqual(a.unstaged, b.unstaged)
  );
}

function areBranchListsEqual(a: GitBranchListResult | undefined, b: GitBranchListResult) {
  if (a === b) return true;
  if (!a || a.current !== b.current || a.branches.length !== b.branches.length) return false;
  for (let i = 0; i < a.branches.length; i += 1) {
    const left = a.branches[i]!;
    const right = b.branches[i]!;
    if (
      left.name !== right.name ||
      left.current !== right.current ||
      left.commit !== right.commit ||
      left.isRemote !== right.isRemote
    ) {
      return false;
    }
  }
  return true;
}

function areWorktreesEqual(a: GitWorktreeInfo[] | undefined, b: GitWorktreeInfo[]) {
  if (a === b) return true;
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.path !== right.path ||
      left.branch !== right.branch ||
      left.commit !== right.commit ||
      left.isMain !== right.isMain
    ) {
      return false;
    }
  }
  return true;
}

function arePrDataEqual(a: PrData | null | undefined, b: PrData | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.number === b.number &&
    a.state === b.state &&
    a.title === b.title &&
    a.url === b.url &&
    a.baseBranch === b.baseBranch &&
    a.isDraft === b.isDraft &&
    a.reviewDecision === b.reviewDecision &&
    a.checksStatus === b.checksStatus &&
    a.updatedAt === b.updatedAt
  );
}

export const useGitStore = create<GitState & GitActions>()((set, get) => ({
  statuses: {},
  worktreeStatuses: {},
  worktrees: {},
  branches: {},
  ghAvailable: {},
  prData: {},
  worktreeSourceInfo: {},

  setStatus: (projectId, status) => {
    if (areGitStatusesEqual(get().statuses[projectId], status)) return;
    set((state) => ({
      statuses: { ...state.statuses, [projectId]: status },
    }));
  },

  clearStatus: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),

  setWorktreeStatus: (worktreePath, status) => {
    if (areGitStatusesEqual(get().worktreeStatuses[worktreePath], status)) return;
    set((state) => ({
      worktreeStatuses: { ...state.worktreeStatuses, [worktreePath]: status },
    }));
  },

  setWorktreeStatuses: (statuses) =>
    set((state) => {
      let nextWorktreeStatuses = state.worktreeStatuses;
      let changed = false;
      for (const [worktreePath, status] of Object.entries(statuses)) {
        if (areGitStatusesEqual(nextWorktreeStatuses[worktreePath], status)) {
          continue;
        }
        if (!changed) {
          nextWorktreeStatuses = { ...state.worktreeStatuses };
          changed = true;
        }
        nextWorktreeStatuses[worktreePath] = status;
      }
      return changed ? { worktreeStatuses: nextWorktreeStatuses } : state;
    }),

  clearWorktreeStatus: (worktreePath) =>
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.worktreeStatuses;
      return { worktreeStatuses: rest };
    }),

  setWorktrees: (projectId, worktrees) => {
    if (areWorktreesEqual(get().worktrees[projectId], worktrees)) return;
    set((state) => ({
      worktrees: { ...state.worktrees, [projectId]: worktrees },
    }));
  },

  setBranches: (projectId, branches) => {
    if (areBranchListsEqual(get().branches[projectId], branches)) return;
    set((state) => ({
      branches: { ...state.branches, [projectId]: branches },
    }));
  },

  setProjectSnapshot: (projectId, snapshot) =>
    set((state) => {
      let nextStatuses = state.statuses;
      let nextBranches = state.branches;
      let nextWorktrees = state.worktrees;
      let nextGhAvailable = state.ghAvailable;
      let changed = false;

      if (snapshot.status && !areGitStatusesEqual(state.statuses[projectId], snapshot.status)) {
        nextStatuses = { ...nextStatuses, [projectId]: snapshot.status };
        changed = true;
      }

      if (snapshot.branches && !areBranchListsEqual(state.branches[projectId], snapshot.branches)) {
        nextBranches = { ...nextBranches, [projectId]: snapshot.branches };
        changed = true;
      }

      if (snapshot.worktrees && !areWorktreesEqual(state.worktrees[projectId], snapshot.worktrees)) {
        nextWorktrees = { ...nextWorktrees, [projectId]: snapshot.worktrees };
        changed = true;
      }

      if (
        snapshot.ghAvailable !== undefined &&
        state.ghAvailable[projectId] !== snapshot.ghAvailable
      ) {
        nextGhAvailable = { ...nextGhAvailable, [projectId]: snapshot.ghAvailable };
        changed = true;
      }

      return changed
        ? {
            statuses: nextStatuses,
            branches: nextBranches,
            worktrees: nextWorktrees,
            ghAvailable: nextGhAvailable,
          }
        : state;
    }),

  setGhAvailable: (projectId, available) => {
    if (get().ghAvailable[projectId] === available) return;
    set((state) => ({
      ghAvailable: { ...state.ghAvailable, [projectId]: available },
    }));
  },

  setPrData: (worktreePath, pr) => {
    if (arePrDataEqual(get().prData[worktreePath], pr)) return;
    set((state) => ({
      prData: { ...state.prData, [worktreePath]: pr },
    }));
  },

  setPrDataBatch: (entries) =>
    set((state) => {
      let nextPrData = state.prData;
      let changed = false;
      for (const [worktreePath, pr] of Object.entries(entries)) {
        if (arePrDataEqual(nextPrData[worktreePath], pr)) {
          continue;
        }
        if (!changed) {
          nextPrData = { ...state.prData };
          changed = true;
        }
        nextPrData[worktreePath] = pr;
      }
      return changed ? { prData: nextPrData } : state;
    }),

  setWorktreeSourceInfo: (worktreePath, info) => {
    const prev = get().worktreeSourceInfo[worktreePath];
    if (prev && prev.sourceBranch === info.sourceBranch && prev.commitsAhead === info.commitsAhead && prev.sourceAhead === info.sourceAhead)
      return;
    set((state) => ({
      worktreeSourceInfo: { ...state.worktreeSourceInfo, [worktreePath]: info },
    }));
  },

  setWorktreeSourceInfoBatch: (entries) =>
    set((state) => {
      let next = state.worktreeSourceInfo;
      let changed = false;
      for (const [worktreePath, info] of Object.entries(entries)) {
        const prev = next[worktreePath];
        if (prev && prev.sourceBranch === info.sourceBranch && prev.commitsAhead === info.commitsAhead && prev.sourceAhead === info.sourceAhead)
          continue;
        if (!changed) {
          next = { ...state.worktreeSourceInfo };
          changed = true;
        }
        next[worktreePath] = info;
      }
      return changed ? { worktreeSourceInfo: next } : state;
    }),
}));
