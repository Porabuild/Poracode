import { create } from "zustand";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  PrComment,
  PrAuthor,
  PrCheck,
  PrCommitSummary,
  PrData,
  PrDetails,
  PrFile,
  PrReviewSummary,
} from "@/shared/contracts";

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
  /** PR file lists keyed by `${projectId}#${prNumber}`. */
  prFiles: Record<string, PrFile[]>;
  /** PR raw unified diffs keyed by `${projectId}#${prNumber}`. */
  prDiffs: Record<string, string>;
  /** PR body + commits + comments + reviews + checks keyed by `${projectId}#${prNumber}`. */
  prDetails: Record<string, PrDetails>;
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
  setPrFiles: (key: string, files: PrFile[]) => void;
  setPrDiff: (key: string, diff: string) => void;
  setPrDetails: (key: string, details: PrDetails) => void;
  appendPrComment: (key: string, comment: PrComment) => void;
  clearPrCache: (key: string) => void;
  /** Optimistically move a single file from unstaged to staged. */
  optimisticStageFile: (key: string, filePath: string, isWorktree: boolean) => void;
  /** Optimistically move a single file from staged to unstaged. */
  optimisticUnstageFile: (key: string, filePath: string, isWorktree: boolean) => void;
  /** Optimistically move all files from unstaged to staged. */
  optimisticStageAll: (key: string, isWorktree: boolean) => void;
  /** Optimistically move all files from staged to unstaged. */
  optimisticUnstageAll: (key: string, isWorktree: boolean) => void;
}

type FileChange = GitStatusResult["staged"][number];

/** Replace any entry with the same path, then append. Mirrors VS Code resource-group semantics. */
function upsertByPath(list: readonly FileChange[], item: FileChange): FileChange[] {
  return [...list.filter((f) => f.path !== item.path), item];
}

/**
 * Insert `item`, summing its +/- into any existing same-path entry (keeping that
 * entry's position). When a file is staged, re-modified, then staged again, git's
 * truth is the cumulative HEAD→index diff — so the optimistic move must add the
 * new hunk's counts onto the already-staged counts rather than replace them.
 * Summing is exact when edits don't overlap lines; the follow-up full refresh
 * reconciles precisely regardless.
 */
function upsertSummingByPath(list: readonly FileChange[], item: FileChange): FileChange[] {
  let matched = false;
  const merged = list.map((f) => {
    if (f.path !== item.path) return f;
    matched = true;
    return {
      ...item,
      insertions: f.insertions + item.insertions,
      deletions: f.deletions + item.deletions,
    };
  });
  return matched ? merged : [...merged, item];
}

/** Bulk variant of {@link upsertSummingByPath}. */
function upsertManySummingByPath(
  list: readonly FileChange[],
  items: readonly FileChange[],
): FileChange[] {
  if (items.length === 0) return [...list];
  let result: FileChange[] = [...list];
  for (const item of items) {
    result = upsertSummingByPath(result, item);
  }
  return result;
}

/** Key used to backfill summary-poll +/- counts from a prior store snapshot. */
function summaryBackfillKey(file: FileChange): string {
  return `${file.staged}\0${file.path}\0${file.oldPath ?? ""}\0${file.status}`;
}

/**
 * True when an incoming summary status carries a file row that has no matching
 * entry in the previous store snapshot — i.e. {@link mergeSummaryFiles} can't
 * backfill its +/- counts because the row moved sections, changed status, or is
 * brand new (e.g. an external `git add` in a terminal). Such a row would
 * otherwise display 0/0 (or stale) forever, since summary polls never carry real
 * counts and the file watcher ignores the `.git/index` write that produced it.
 * Untracked ("?") rows count as a miss too: full refreshes fill their insertion
 * counts, so a missed untracked row is also stale at 0. Callers escalate to a
 * full refresh when this returns true.
 */
export function summaryBackfillMissed(
  previous: GitStatusResult | undefined,
  incoming: GitStatusResult,
): boolean {
  if (incoming.detail !== "summary") return false;
  const previousKeys = new Set<string>();
  if (previous) {
    for (const file of previous.staged) previousKeys.add(summaryBackfillKey(file));
    for (const file of previous.unstaged) previousKeys.add(summaryBackfillKey(file));
  }
  for (const file of incoming.staged) {
    if (!previousKeys.has(summaryBackfillKey(file))) return true;
  }
  for (const file of incoming.unstaged) {
    if (!previousKeys.has(summaryBackfillKey(file))) return true;
  }
  return false;
}

function removeByPath(list: readonly FileChange[], path: string): FileChange[] {
  return list.filter((f) => f.path !== path);
}

function areStatusFilesEqual(
  a: readonly GitStatusResult["staged"][number][] | undefined,
  b: readonly GitStatusResult["staged"][number][] | undefined,
) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
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
    a.detail === b.detail &&
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
    areStatusFilesEqual(a.conflictFiles, b.conflictFiles) &&
    areStatusFilesEqual(a.staged, b.staged) &&
    areStatusFilesEqual(a.unstaged, b.unstaged)
  );
}

function mergeSummaryFiles(
  previous: readonly FileChange[],
  incoming: readonly FileChange[],
): FileChange[] {
  if (incoming.length === 0) return [];
  const previousByKey = new Map(previous.map((file) => [summaryBackfillKey(file), file]));
  return incoming.map((file) => {
    const previousFile = previousByKey.get(summaryBackfillKey(file));
    return previousFile
      ? { ...file, insertions: previousFile.insertions, deletions: previousFile.deletions }
      : file;
  });
}

function mergeSummaryStatus(
  previous: GitStatusResult | undefined,
  incoming: GitStatusResult,
): GitStatusResult {
  if (incoming.detail !== "summary" || !previous) return incoming;
  const staged = mergeSummaryFiles(previous.staged, incoming.staged);
  const unstaged = mergeSummaryFiles(previous.unstaged, incoming.unstaged);
  return {
    ...incoming,
    hasRemote: incoming.hasRemote || previous.hasRemote,
    remoteInfo: incoming.remoteInfo ?? previous.remoteInfo,
    staged,
    unstaged,
    totalInsertions:
      staged.reduce((sum, file) => sum + file.insertions, 0) +
      unstaged.reduce((sum, file) => sum + file.insertions, 0),
    totalDeletions:
      staged.reduce((sum, file) => sum + file.deletions, 0) +
      unstaged.reduce((sum, file) => sum + file.deletions, 0),
  };
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
      left.isRemote !== right.isRemote ||
      left.remote !== right.remote
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
    a.mergeable === b.mergeable &&
    a.mergeStateStatus === b.mergeStateStatus &&
    a.viewerDidAuthor === b.viewerDidAuthor &&
    a.updatedAt === b.updatedAt
  );
}

function areAuthorsEqual(a: PrAuthor | null | undefined, b: PrAuthor | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.login === b.login && a.avatarUrl === b.avatarUrl;
}

function areArraysEqual<T>(
  a: readonly T[],
  b: readonly T[],
  compare: (left: T, right: T) => boolean,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!compare(a[i]!, b[i]!)) return false;
  }
  return true;
}

function arePrCommitsEqual(a: PrCommitSummary, b: PrCommitSummary): boolean {
  return (
    a.oid === b.oid &&
    a.abbreviatedOid === b.abbreviatedOid &&
    a.messageHeadline === b.messageHeadline &&
    a.messageBody === b.messageBody &&
    a.authoredDate === b.authoredDate &&
    a.url === b.url &&
    areAuthorsEqual(a.author, b.author)
  );
}

function arePrCommentsEqual(a: PrComment, b: PrComment): boolean {
  return (
    a.id === b.id &&
    a.body === b.body &&
    a.createdAt === b.createdAt &&
    a.url === b.url &&
    areAuthorsEqual(a.author, b.author)
  );
}

function arePrReviewsEqual(a: PrReviewSummary, b: PrReviewSummary): boolean {
  return (
    a.id === b.id &&
    a.state === b.state &&
    a.body === b.body &&
    a.submittedAt === b.submittedAt &&
    a.url === b.url &&
    areAuthorsEqual(a.author, b.author)
  );
}

function arePrChecksEqual(a: PrCheck, b: PrCheck): boolean {
  return (
    a.name === b.name &&
    a.state === b.state &&
    a.conclusion === b.conclusion &&
    a.url === b.url &&
    a.workflowName === b.workflowName
  );
}

function arePrDetailsEqual(a: PrDetails | undefined, b: PrDetails): boolean {
  if (a === b) return true;
  if (!a) return false;
  return (
    a.number === b.number &&
    a.title === b.title &&
    a.body === b.body &&
    a.baseBranch === b.baseBranch &&
    a.headBranch === b.headBranch &&
    a.additions === b.additions &&
    a.deletions === b.deletions &&
    a.changedFiles === b.changedFiles &&
    a.createdAt === b.createdAt &&
    a.mergedAt === b.mergedAt &&
    a.closedAt === b.closedAt &&
    areAuthorsEqual(a.author, b.author) &&
    areAuthorsEqual(a.mergedBy, b.mergedBy) &&
    areArraysEqual(a.commits, b.commits, arePrCommitsEqual) &&
    areArraysEqual(a.comments, b.comments, arePrCommentsEqual) &&
    areArraysEqual(a.reviews, b.reviews, arePrReviewsEqual) &&
    areArraysEqual(a.checks, b.checks, arePrChecksEqual)
  );
}

/**
 * Persist a snapshot of git state to localStorage so the next app launch can
 * paint the previous session's +/- chips, branch, and PR section instantly,
 * while the background refresh runs to update them. Only fields that are cheap
 * to serialize and useful at first paint are persisted — the in-flight `prFiles`
 * / `prDiffs` caches are kept session-local since they're tied to overlay state.
 */
const PERSIST_KEY = "lightcode-git-cache-v1";
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedSnapshot {
  v: 1;
  ts: number;
  statuses: Record<string, GitStatusResult>;
  worktreeStatuses: Record<string, GitStatusResult>;
  worktrees: Record<string, GitWorktreeInfo[]>;
  branches: Record<string, GitBranchListResult>;
  ghAvailable: Record<string, boolean>;
  prData: Record<string, PrData | null>;
  worktreeSourceInfo: Record<string, WorktreeSourceInfo>;
}

function loadPersistedSnapshot(): Partial<PersistedSnapshot> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedSnapshot;
    if (parsed.v !== 1) return {};
    if (Date.now() - parsed.ts > PERSIST_TTL_MS) return {};
    return parsed;
  } catch {
    return {};
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(state: GitState) {
  if (typeof localStorage === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  // Debounce — refreshes write to several fields rapidly. One round-trip after
  // 200ms of quiet covers the whole batch.
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const snapshot: PersistedSnapshot = {
        v: 1,
        ts: Date.now(),
        statuses: state.statuses,
        worktreeStatuses: state.worktreeStatuses,
        worktrees: state.worktrees,
        branches: state.branches,
        ghAvailable: state.ghAvailable,
        prData: state.prData,
        worktreeSourceInfo: state.worktreeSourceInfo,
      };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
    } catch {
      // localStorage may be full or unavailable — silently skip.
    }
  }, 200);
}

const initialPersisted = loadPersistedSnapshot();

export const useGitStore = create<GitState & GitActions>()((set, get) => ({
  statuses: initialPersisted.statuses ?? {},
  worktreeStatuses: initialPersisted.worktreeStatuses ?? {},
  worktrees: initialPersisted.worktrees ?? {},
  branches: initialPersisted.branches ?? {},
  ghAvailable: initialPersisted.ghAvailable ?? {},
  prData: initialPersisted.prData ?? {},
  worktreeSourceInfo: initialPersisted.worktreeSourceInfo ?? {},
  prFiles: {},
  prDiffs: {},
  prDetails: {},

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
    const nextStatus = mergeSummaryStatus(get().worktreeStatuses[worktreePath], status);
    if (areGitStatusesEqual(get().worktreeStatuses[worktreePath], nextStatus)) return;
    set((state) => ({
      worktreeStatuses: { ...state.worktreeStatuses, [worktreePath]: nextStatus },
    }));
  },

  setWorktreeStatuses: (statuses) =>
    set((state) => {
      let nextWorktreeStatuses = state.worktreeStatuses;
      let changed = false;
      for (const [worktreePath, status] of Object.entries(statuses)) {
        const nextStatus = mergeSummaryStatus(nextWorktreeStatuses[worktreePath], status);
        if (areGitStatusesEqual(nextWorktreeStatuses[worktreePath], nextStatus)) {
          continue;
        }
        if (!changed) {
          nextWorktreeStatuses = { ...state.worktreeStatuses };
          changed = true;
        }
        nextWorktreeStatuses[worktreePath] = nextStatus;
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

      if (
        snapshot.worktrees &&
        !areWorktreesEqual(state.worktrees[projectId], snapshot.worktrees)
      ) {
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
    if (
      prev &&
      prev.sourceBranch === info.sourceBranch &&
      prev.commitsAhead === info.commitsAhead &&
      prev.sourceAhead === info.sourceAhead
    )
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
        if (
          prev &&
          prev.sourceBranch === info.sourceBranch &&
          prev.commitsAhead === info.commitsAhead &&
          prev.sourceAhead === info.sourceAhead
        )
          continue;
        if (!changed) {
          next = { ...state.worktreeSourceInfo };
          changed = true;
        }
        next[worktreePath] = info;
      }
      return changed ? { worktreeSourceInfo: next } : state;
    }),

  optimisticStageFile: (key, filePath, isWorktree) =>
    set((state) => {
      const bucket = isWorktree ? "worktreeStatuses" : "statuses";
      const status = state[bucket][key];
      if (!status) return state;
      const conflictFile = status.conflictFiles?.find((f) => f.path === filePath);
      if (conflictFile) {
        const moved: FileChange = { ...conflictFile, staged: true, status: "M" };
        return {
          [bucket]: {
            ...state[bucket],
            [key]: {
              ...status,
              staged: upsertByPath(status.staged, moved),
              conflictFiles: removeByPath(status.conflictFiles!, filePath),
            },
          },
        };
      }
      const file = status.unstaged.find((f) => f.path === filePath);
      if (!file) return state;
      const moved: FileChange = {
        ...file,
        staged: true,
        status: file.status === "?" ? "A" : file.status,
      };
      return {
        [bucket]: {
          ...state[bucket],
          [key]: {
            ...status,
            staged: upsertSummingByPath(status.staged, moved),
            unstaged: removeByPath(status.unstaged, filePath),
          },
        },
      };
    }),

  optimisticUnstageFile: (key, filePath, isWorktree) =>
    set((state) => {
      const bucket = isWorktree ? "worktreeStatuses" : "statuses";
      const status = state[bucket][key];
      if (!status) return state;
      const file = status.staged.find((f) => f.path === filePath);
      if (!file) return state;
      const moved: FileChange = { ...file, staged: false };
      return {
        [bucket]: {
          ...state[bucket],
          [key]: {
            ...status,
            staged: removeByPath(status.staged, filePath),
            unstaged: upsertSummingByPath(status.unstaged, moved),
          },
        },
      };
    }),

  optimisticStageAll: (key, isWorktree) =>
    set((state) => {
      const bucket = isWorktree ? "worktreeStatuses" : "statuses";
      const status = state[bucket][key];
      if (!status || status.unstaged.length === 0) return state;
      const moved: FileChange[] = status.unstaged.map((f) => ({
        ...f,
        staged: true,
        status: f.status === "?" ? "A" : f.status,
      }));
      return {
        [bucket]: {
          ...state[bucket],
          [key]: {
            ...status,
            staged: upsertManySummingByPath(status.staged, moved),
            unstaged: [],
          },
        },
      };
    }),

  setPrFiles: (key, files) => set((state) => ({ prFiles: { ...state.prFiles, [key]: files } })),

  setPrDiff: (key, diff) => set((state) => ({ prDiffs: { ...state.prDiffs, [key]: diff } })),

  setPrDetails: (key, details) => {
    if (arePrDetailsEqual(get().prDetails[key], details)) return;
    set((state) => ({ prDetails: { ...state.prDetails, [key]: details } }));
  },

  appendPrComment: (key, comment) =>
    set((state) => {
      const current = state.prDetails[key];
      if (!current) return state;
      // Replace any existing entry with the same id (re-fetch after optimistic insert)
      // so the timeline doesn't grow stale duplicates.
      const filtered = current.comments.filter((c) => c.id !== comment.id);
      return {
        prDetails: {
          ...state.prDetails,
          [key]: { ...current, comments: [...filtered, comment] },
        },
      };
    }),

  clearPrCache: (key) =>
    set((state) => {
      const { [key]: _f, ...restFiles } = state.prFiles;
      const { [key]: _d, ...restDiffs } = state.prDiffs;
      const { [key]: _det, ...restDetails } = state.prDetails;
      return {
        prFiles: restFiles,
        prDiffs: restDiffs,
        prDetails: restDetails,
      };
    }),

  optimisticUnstageAll: (key, isWorktree) =>
    set((state) => {
      const bucket = isWorktree ? "worktreeStatuses" : "statuses";
      const status = state[bucket][key];
      if (!status || status.staged.length === 0) return state;
      const moved: FileChange[] = status.staged.map((f) => ({ ...f, staged: false }));
      return {
        [bucket]: {
          ...state[bucket],
          [key]: {
            ...status,
            staged: [],
            unstaged: upsertManySummingByPath(status.unstaged, moved),
          },
        },
      };
    }),
}));

// Persist a snapshot whenever any of the cached fields change.
useGitStore.subscribe((state, prev) => {
  if (
    state.statuses !== prev.statuses ||
    state.worktreeStatuses !== prev.worktreeStatuses ||
    state.worktrees !== prev.worktrees ||
    state.branches !== prev.branches ||
    state.ghAvailable !== prev.ghAvailable ||
    state.prData !== prev.prData ||
    state.worktreeSourceInfo !== prev.worktreeSourceInfo
  ) {
    schedulePersist(state);
  }
});
