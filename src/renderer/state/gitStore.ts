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
  PrReviewThread,
  ForgeRepository,
  GithubPollingProblem,
} from "@/shared/contracts";

export interface WorktreeSourceInfo {
  sourceBranch: string | null;
  commitsAhead: number;
  sourceAhead: number;
}

interface GitState {
  githubPollingProblems: Record<string, GithubPollingProblem | null>;
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
  setGithubPollingProblem: (projectId: string, problem: GithubPollingProblem | null) => void;
  setStatus: (projectId: string, status: GitStatusResult) => void;
  clearStatus: (projectId: string) => void;
  setWorktreeStatus: (worktreePath: string, status: GitStatusResult) => void;
  /** Apply an aggregate published by a remote host without deriving totals from cached file rows. */
  setRemoteWorktreeSummary: (worktreePath: string, status: GitStatusResult) => void;
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

export function areGitStatusesEqual(a: GitStatusResult | undefined, b: GitStatusResult) {
  if (a === b) return true;
  if (!a) return false;
  const leftRemote = a.remoteInfo;
  const rightRemote = b.remoteInfo;
  return (
    a.detail === b.detail &&
    a.isRepo === b.isRepo &&
    a.branch === b.branch &&
    a.headSha === b.headSha &&
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

export function areBranchListsEqual(a: GitBranchListResult | undefined, b: GitBranchListResult) {
  if (a === b) return true;
  if (
    !a ||
    a.current !== b.current ||
    a.defaultBranch !== b.defaultBranch ||
    a.branches.length !== b.branches.length
  ) {
    return false;
  }
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

export function areWorktreesEqual(
  a: readonly GitWorktreeInfo[] | undefined,
  b: readonly GitWorktreeInfo[],
) {
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

export function arePrDataEqual(a: PrData | null | undefined, b: PrData | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.number === b.number &&
    a.state === b.state &&
    a.headSha === b.headSha &&
    a.isCrossRepository === b.isCrossRepository &&
    areForgeSourcesEqual(a.source, b.source) &&
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

function areForgeSourcesEqual(
  a: ForgeRepository | undefined,
  b: ForgeRepository | undefined,
): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function isMergedPrRegression(
  current: PrData | null | undefined,
  incoming: PrData | null | undefined,
  previous: PrData | null | undefined,
): boolean {
  if (current?.state !== "merged") return false;
  if (!incoming) return current !== previous;
  return (
    current.number === incoming.number &&
    current.url === incoming.url &&
    incoming.state !== "merged"
  );
}

/** Structural equality for small host-supplied lists (labels, reviewers, reactions, events). */
function areJsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
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
    areAuthorsEqual(a.author, b.author) &&
    areJsonEqual(a.reactions ?? [], b.reactions ?? [])
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
    a.workflowName === b.workflowName &&
    a.startedAt === b.startedAt &&
    a.completedAt === b.completedAt
  );
}

function areReviewThreadsEqual(a: PrReviewThread, b: PrReviewThread): boolean {
  return (
    a.id === b.id &&
    a.isResolved === b.isResolved &&
    a.isOutdated === b.isOutdated &&
    a.path === b.path &&
    a.line === b.line &&
    a.side === b.side &&
    areArraysEqual(a.comments, b.comments, arePrCommentsEqual)
  );
}

export function arePrDetailsEqual(a: PrDetails | undefined, b: PrDetails): boolean {
  if (a === b) return true;
  if (!a) return false;
  return (
    a.number === b.number &&
    a.title === b.title &&
    areForgeSourcesEqual(a.source, b.source) &&
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
    areArraysEqual(a.reviewThreads ?? [], b.reviewThreads ?? [], areReviewThreadsEqual) &&
    areArraysEqual(a.checks, b.checks, arePrChecksEqual) &&
    areJsonEqual(a.labels ?? [], b.labels ?? []) &&
    areJsonEqual(a.requestedReviewers ?? [], b.requestedReviewers ?? []) &&
    areJsonEqual(a.reactions ?? [], b.reactions ?? []) &&
    areJsonEqual(a.timeline ?? [], b.timeline ?? [])
  );
}

/**
 * Persist a snapshot of git state to localStorage so the next app launch can
 * paint the previous session's +/- chips, branch, and PR section instantly,
 * while the background refresh runs to update them. Only fields that are cheap
 * to serialize and useful at first paint are persisted — the in-flight `prFiles`
 * / `prDiffs` caches are kept session-local since they're tied to overlay state.
 */
// v3 stores fields separately so status churn does not copy every cached PR and
// branch into Blink storage. Released v2 data remains valid and migrates on the
// next write; raw SSH origins still require confirmation by the owning host.
const PERSIST_KEY = "poracode-git-cache-v3";
const LEGACY_PERSIST_KEY = "poracode-git-cache-v2";
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PERSIST_FIELDS = [
  "statuses",
  "worktreeStatuses",
  "worktrees",
  "branches",
  "ghAvailable",
  "prData",
  "worktreeSourceInfo",
] as const;
type PersistedSnapshot = Pick<GitState, (typeof PERSIST_FIELDS)[number]>;
let persistedFields: Partial<PersistedSnapshot> = {};
let legacySnapshot: string | null = null;
let canPersist = true;

function loadPersistedSnapshot(): Partial<PersistedSnapshot> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const metadata = JSON.parse(raw) as { v: number; ts: number };
      if (metadata.v !== 3) {
        canPersist = false;
        return {};
      }
      if (typeof metadata.ts !== "number" || Date.now() - metadata.ts > PERSIST_TTL_MS) return {};
      const snapshot = Object.fromEntries(
        PERSIST_FIELDS.map((field) => [
          field,
          JSON.parse(localStorage.getItem(`${PERSIST_KEY}:${field}`) ?? "{}"),
        ]),
      ) as PersistedSnapshot;
      persistedFields = snapshot;
      return snapshot;
    }
    const legacy = localStorage.getItem(LEGACY_PERSIST_KEY);
    if (!legacy) return {};
    const parsed = JSON.parse(legacy) as Partial<PersistedSnapshot> & { v: number; ts: number };
    if (parsed.v !== 2) return {};
    legacySnapshot = legacy;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > PERSIST_TTL_MS) return {};
    return parsed;
  } catch {
    return {};
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistIdleHandle: number | null = null;
let pendingPersistState: GitState | null = null;
let persistWindowStartedAt: number | null = null;
const PERSIST_DEBOUNCE_MS = 1_500;
const PERSIST_MAX_WAIT_MS = 8_000;
const PERSIST_IDLE_TIMEOUT_MS = 2_000;

function cancelScheduledPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (
    persistIdleHandle !== null &&
    typeof window !== "undefined" &&
    typeof window.cancelIdleCallback === "function"
  ) {
    window.cancelIdleCallback(persistIdleHandle);
  }
  persistIdleHandle = null;
  pendingPersistState = null;
  persistWindowStartedAt = null;
}

function flushPersistSnapshot(state: GitState): void {
  if (typeof localStorage === "undefined" || !canPersist) return;
  try {
    if (legacySnapshot !== null) {
      // The loaded snapshot is still in the store. Release its old storage
      // quota before writing the split cache instead of requiring two copies.
      localStorage.removeItem(LEGACY_PERSIST_KEY);
    }
    for (const field of PERSIST_FIELDS) {
      if (persistedFields[field] === state[field]) continue;
      localStorage.setItem(`${PERSIST_KEY}:${field}`, JSON.stringify(state[field]));
      persistedFields = { ...persistedFields, [field]: state[field] };
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ v: 3, ts: Date.now() }));
    legacySnapshot = null;
  } catch {
    if (legacySnapshot !== null) {
      persistedFields = {};
      try {
        for (const field of PERSIST_FIELDS) localStorage.removeItem(`${PERSIST_KEY}:${field}`);
        localStorage.removeItem(PERSIST_KEY);
        localStorage.setItem(LEGACY_PERSIST_KEY, legacySnapshot);
      } catch {
        // Keep the migration snapshot in memory for the next attempt.
      }
    }
    // localStorage may be full or unavailable — the live store remains usable.
  }
}

function schedulePersist(state: GitState) {
  if (typeof localStorage === "undefined") return;
  const now = Date.now();
  pendingPersistState = state;
  if (persistWindowStartedAt === null) {
    persistWindowStartedAt = now;
  }
  const remainingMaxWait = Math.max(0, PERSIST_MAX_WAIT_MS - (now - persistWindowStartedAt));
  const delayMs = Math.min(PERSIST_DEBOUNCE_MS, remainingMaxWait);
  if (persistTimer !== null && delayMs > 0) clearTimeout(persistTimer);
  else if (persistTimer !== null && delayMs === 0) return;
  // Coalesce bursts during active agent edits and defer the synchronous
  // `JSON.stringify` + `localStorage.setItem` write to an idle frame so
  // background worktree churn never stalls UI animations or thread switches,
  // bounded by `PERSIST_MAX_WAIT_MS` so continuous churn still checkpoints.
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistWindowStartedAt = null;
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      if (persistIdleHandle !== null) return;
      persistIdleHandle = window.requestIdleCallback(
        () => {
          persistIdleHandle = null;
          const latest = pendingPersistState;
          pendingPersistState = null;
          if (latest) flushPersistSnapshot(latest);
        },
        { timeout: PERSIST_IDLE_TIMEOUT_MS },
      );
      return;
    }
    const latest = pendingPersistState;
    pendingPersistState = null;
    if (latest) flushPersistSnapshot(latest);
  }, delayMs);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!pendingPersistState) return;
    const latest = pendingPersistState;
    cancelScheduledPersist();
    flushPersistSnapshot(latest);
  });
}

const initialPersisted = loadPersistedSnapshot();

export const useGitStore = create<GitState & GitActions>()((set, get) => ({
  githubPollingProblems: {},
  setGithubPollingProblem: (projectId, problem) => {
    if (JSON.stringify(get().githubPollingProblems[projectId] ?? null) === JSON.stringify(problem))
      return;
    set((state) => ({
      githubPollingProblems: { ...state.githubPollingProblems, [projectId]: problem },
    }));
  },
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
    const nextStatus = mergeSummaryStatus(get().statuses[projectId], status);
    if (areGitStatusesEqual(get().statuses[projectId], nextStatus)) return;
    set((state) => ({
      statuses: { ...state.statuses, [projectId]: nextStatus },
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

  setRemoteWorktreeSummary: (worktreePath, status) => {
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
    const current = get().prData[worktreePath];
    if (isMergedPrRegression(current, pr, current) || arePrDataEqual(current, pr)) return;
    set((state) => ({
      prData: { ...state.prData, [worktreePath]: pr },
    }));
  },

  setPrDataBatch: (entries) =>
    set((state) => {
      let nextPrData = state.prData;
      let changed = false;
      for (const [worktreePath, pr] of Object.entries(entries)) {
        const current = nextPrData[worktreePath];
        if (isMergedPrRegression(current, pr, current) || arePrDataEqual(current, pr)) {
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
    const current = get().prDetails[key];
    if ((current?.mergedAt && !details.mergedAt) || arePrDetailsEqual(current, details)) return;
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

export function resetGitStoreCache(): void {
  useGitStore.setState({
    githubPollingProblems: {},
    statuses: {},
    worktreeStatuses: {},
    worktrees: {},
    branches: {},
    ghAvailable: {},
    prData: {},
    worktreeSourceInfo: {},
    prFiles: {},
    prDiffs: {},
    prDetails: {},
  });
  // `setState` synchronously schedules persistence through the subscription
  // below. A desktop/session reset must remove the previous identity's cache
  // immediately, rather than leave a reload window before that debounce fires.
  cancelScheduledPersist();
  persistedFields = {};
  legacySnapshot = null;
  if (typeof localStorage !== "undefined" && canPersist) {
    try {
      localStorage.removeItem(PERSIST_KEY);
      localStorage.removeItem(LEGACY_PERSIST_KEY);
      for (const field of PERSIST_FIELDS) localStorage.removeItem(`${PERSIST_KEY}:${field}`);
    } catch {
      // Storage may be unavailable (privacy mode / sandboxed webview).
    }
  }
}

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

if (legacySnapshot !== null) schedulePersist(useGitStore.getState());
