import type {
  GitStatusDetail,
  GitStatusResult,
  PrData,
  ProjectLocation,
  RemoteHostPlatform,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { summaryBackfillMissed, useGitStore } from "@/renderer/state/gitStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { aggregatePrChecksStatus, combineChecksStatus } from "@/renderer/utils/prStatus";
import {
  buildSidebarProjectRows,
  SIDEBAR_THREAD_LIST_PAGE_SIZE,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";

export type GitRefreshReason = "initial" | "watcher" | "fetch" | "manual" | "poll";
export type GitRefreshMode = "status" | "full";

export interface GitRefreshOptions {
  /** Returns false to short-circuit after async awaits (lets callers cancel on unmount). */
  isActive?: () => boolean;
  /** If true, runs `git fetch origin` before the snapshot refresh. */
  fetchRemote?: boolean;
}

const refreshingProjects = new Set<string>();
const pendingWatcherRefreshProjects = new Set<string>();
const watchedWorktreePaths = new Map<string, string>();
const activeRefreshTokens = new Map<string, symbol>();
const GIT_REFRESH_TIMEOUT_MS = 30_000;
export const PR_PENDING_REFRESH_INTERVAL_MS = 30_000;
export const PR_POST_PUSH_STATUS_WAIT_MS = 15_000;
export const PR_POST_PUSH_STATUS_POLL_MS = 5_000;

const alwaysActive = () => true;

/**
 * A remote worth trying `gh` against: an explicit GitHub remote, an as-yet
 * unclassified one ("unknown" — covers SSH host aliases that resolve to
 * github.com), or one we haven't inspected yet (undefined). This is the gate
 * every PR-fetch path checks (alongside `ghAvailable`) before paying a
 * `gh pr list` spawn — see {@link prefetchBranchPrData} and the worktree git
 * panel's manual refresh.
 */
export function mightBeGitHubRemote(platform: RemoteHostPlatform | undefined): boolean {
  return platform === undefined || platform === "github" || platform === "unknown";
}

const BRANCH_PR_PREFETCH_THROTTLE_MS = 10_000;
const branchPrPrefetchLastRun = new Map<string, number>();
const branchPrPrefetchInFlight = new Set<string>();

/**
 * Bulk-fetch PR status for every branch of a project in one `gh pr list` call and
 * cache it under branch-name keys (see {@link buildBranchNamePrKey}) so the branch
 * selector can show PR-status icons for remote/local branches that aren't checked
 * out as a worktree. Dedupes in-flight calls, throttles (so dropdown opens + the
 * refresh cycle don't spam `gh`), and self-gates on gh availability + a GitHub
 * remote. Results persist for free via the gitStore prData snapshot, so cached
 * icons show instantly and refresh in place.
 */
export async function prefetchBranchPrData(project: {
  id: string;
  location: ProjectLocation;
}): Promise<void> {
  if (branchPrPrefetchInFlight.has(project.id)) return;
  const last = branchPrPrefetchLastRun.get(project.id) ?? 0;
  if (Date.now() - last < BRANCH_PR_PREFETCH_THROTTLE_MS) return;
  const state = useGitStore.getState();
  if (!state.ghAvailable[project.id]) return;
  if (!mightBeGitHubRemote(state.statuses[project.id]?.remoteInfo?.platform)) return;

  branchPrPrefetchInFlight.add(project.id);
  branchPrPrefetchLastRun.set(project.id, Date.now());
  try {
    const { prs } = await readBridge().ghListPrs({ projectLocation: project.location });
    const updates: Record<string, PrData | null> = {};
    for (const [branch, pr] of Object.entries(prs)) {
      updates[buildBranchNamePrKey(project.id, branch)] = pr;
    }
    if (Object.keys(updates).length > 0) {
      useGitStore.getState().setPrDataBatch(updates);
    }
  } catch (err) {
    console.warn(`[git-refresh] ghListPrs failed project=${project.id}`, err);
  } finally {
    branchPrPrefetchInFlight.delete(project.id);
  }
}

function getWorktreeStatusDetail(
  reason: GitRefreshReason,
  location: ProjectLocation,
): GitStatusDetail {
  if (location.kind === "wsl" && (reason === "fetch" || reason === "poll")) return "full";
  return reason === "fetch" || reason === "poll" ? "summary" : "full";
}

export function getWatcherRefreshMode(projectId: string): GitRefreshMode {
  return useGitStore.getState().statuses[projectId]?.isRepo === false ? "full" : "status";
}

/** Worktree paths with an in-flight summary→full escalation, so poll bursts don't stack requests. */
const summaryFullEscalationInFlight = new Set<string>();
const summaryFullEscalationPending = new Set<string>();

/**
 * A summary poll never carries real +/- counts — `mergeSummaryStatus` backfills
 * them from the prior store snapshot. When a row can't be backfilled (it moved
 * sections, changed status, or is brand new — e.g. an external `git add` in a
 * terminal that the file watcher ignores), the counts stay 0/stale forever. This
 * returns the worktree paths whose incoming summary status has such a miss,
 * comparing against the CURRENT store snapshot (must be called BEFORE the summary
 * status is merged in, or the miss becomes invisible).
 */
function findSummaryBackfillMisses(statuses: Record<string, GitStatusResult>): string[] {
  const store = useGitStore.getState();
  const missed: string[] = [];
  for (const [worktreePath, status] of Object.entries(statuses)) {
    if (summaryBackfillMissed(store.worktreeStatuses[worktreePath], status)) {
      missed.push(worktreePath);
    }
  }
  return missed;
}

/**
 * Fetch a FULL worktree status for paths whose summary poll couldn't be
 * backfilled and write the exact counts into the store. Fire-and-forget and
 * deduped per path so overlapping poll cycles don't stack requests. This
 * deliberately outlives the triggering refresh — `git add`/`reset` fire no
 * watcher event, so this is the only path that reconciles externally-staged
 * counts — and the store write is idempotent (`setWorktreeStatuses` dedupes), so
 * it applies unconditionally rather than gating on the refresh token.
 */
function escalateSummaryToFull(location: ProjectLocation, worktreePaths: readonly string[]): void {
  const paths = worktreePaths.filter((p) => !summaryFullEscalationInFlight.has(p));
  if (paths.length === 0) return;
  for (const p of paths) summaryFullEscalationInFlight.add(p);
  void readBridge()
    .gitWorktreeStatusBatch({
      projectLocation: location,
      worktreePaths: [...paths],
      detail: "full",
    })
    .then((batch) => {
      if (Object.keys(batch.statuses).length > 0) {
        useGitStore.getState().setWorktreeStatuses(batch.statuses);
        for (const p of Object.keys(batch.statuses)) summaryFullEscalationPending.delete(p);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      for (const p of paths) summaryFullEscalationInFlight.delete(p);
    });
}

/**
 * Merge a batch of worktree summary statuses into the store, escalating any path
 * whose counts couldn't be backfilled to a follow-up full refresh. The miss
 * check runs against the pre-merge store state.
 */
function applyWorktreeStatusBatch(
  location: ProjectLocation,
  statuses: Record<string, GitStatusResult>,
): void {
  const missed = findSummaryBackfillMisses(statuses);
  for (const p of missed) summaryFullEscalationPending.add(p);
  for (const [p, status] of Object.entries(statuses)) {
    if (status.detail !== "summary") summaryFullEscalationPending.delete(p);
  }
  useGitStore.getState().setWorktreeStatuses(statuses);
  const stale = Object.keys(statuses).filter((p) => summaryFullEscalationPending.has(p));
  if (stale.length > 0) escalateSummaryToFull(location, stale);
}

type ActiveGitProject = { id: string; location: ProjectLocation };

interface PendingPrRefreshTarget {
  projectId: string;
  projectLocation: ProjectLocation;
  prKey: string;
  branch: string;
  detailsCacheKey: string;
  prNumber: number;
}

interface PendingPrRefreshEntry {
  target: PendingPrRefreshTarget;
  intervalId: ReturnType<typeof setInterval>;
  inFlight: boolean;
}

const pendingPrRefreshEntries = new Map<string, PendingPrRefreshEntry>();
let pendingPrRefreshActiveProjects: readonly ActiveGitProject[] = [];

interface PostPushPrRefreshTarget {
  projectId: string;
  projectLocation: ProjectLocation;
  prKey: string;
  branch: string;
}

interface PostPushPrRefreshEntry {
  target: PostPushPrRefreshTarget;
  timeoutId: ReturnType<typeof setTimeout>;
  attempts: number;
  latest: PrData | null | undefined;
}

const postPushPrRefreshEntries = new Map<string, PostPushPrRefreshEntry>();

function isRefreshCurrent(projectId: string, token: symbol, isActive: () => boolean): boolean {
  return isActive() && activeRefreshTokens.get(projectId) === token;
}

function addPanelContextWorktreePath(
  paths: Set<string>,
  projectId: string,
  enabled: boolean,
  context: { projectId: string; worktreePath?: string } | null,
): void {
  if (enabled && context?.projectId === projectId && context.worktreePath) {
    paths.add(context.worktreePath);
  }
}

export function getProjectActiveWorktreePaths(projectId: string): string[] {
  const appState = useAppStore.getState();
  const panelState = usePanelStore.getState();
  const sidebarState = useSidebarUiStore.getState();
  const paths = new Set<string>();
  const project = appState.projects.find((p) => p.id === projectId);
  const projectThreads = appState.threads.filter((t) => t.projectId === projectId && !t.archived);
  const experimentState = useExperimentStore.getState();

  for (const experiment of Object.values(experimentState.experiments)) {
    if (
      experiment.projectId !== projectId ||
      (experiment.status !== "running" &&
        !(appState.view.kind === "experiment" && appState.view.experimentId === experiment.id))
    ) {
      continue;
    }
    for (const candidate of experiment.candidates) {
      const worktreePath = appState.threads.find(
        (thread) => thread.id === candidate.threadId,
      )?.worktreePath;
      if (worktreePath) paths.add(worktreePath);
    }
  }

  if (project && !project.disabled && !(sidebarState.collapsedProjects[projectId] ?? false)) {
    const rows = buildSidebarProjectRows({
      projectId,
      projectThreads,
      sortMode: panelState.threadSortMode,
      collapsedWorktrees: sidebarState.collapsedWorktrees,
      visibleLimit: sidebarState.threadListLimits[projectId] ?? SIDEBAR_THREAD_LIST_PAGE_SIZE,
    });
    for (const row of rows) {
      if (row.kind === "worktree-group") paths.add(row.group.worktreePath);
      if (row.kind === "thread" && row.thread.worktreePath) paths.add(row.thread.worktreePath);
    }
  }

  if (appState.view.kind === "thread") {
    const paneIds = new Set(appState.view.panes);
    for (const thread of appState.threads) {
      if (thread.projectId === projectId && paneIds.has(thread.id) && thread.worktreePath) {
        paths.add(thread.worktreePath);
      }
    }
  }

  addPanelContextWorktreePath(
    paths,
    projectId,
    (panelState.rightPanelTab === "git" && panelState.gitReviewAsPanel) ||
      panelState.gitOverlayOpen,
    panelState.gitReviewContext,
  );
  addPanelContextWorktreePath(
    paths,
    projectId,
    panelState.rightPanelTab === "files",
    panelState.filesPanelContext,
  );

  const terminalState = useDevTerminalStore.getState();
  const terminalIsVisible =
    terminalState.isOpen &&
    (useSharedSettings.getState().terminalPosition === "bottom" ||
      panelState.rightPanelTab === "terminal");
  if (
    terminalIsVisible &&
    terminalState.activeProjectId === projectId &&
    terminalState.activeWorktreePath
  ) {
    paths.add(terminalState.activeWorktreePath);
  }

  return Array.from(paths).sort();
}

function getProjectActiveWorktreePathSet(projectId: string): Set<string> {
  return new Set(getProjectActiveWorktreePaths(projectId));
}

export function syncWatchedWorktreeProject(projectId: string): string[] {
  const worktreePaths = getProjectActiveWorktreePaths(projectId);
  const wtPaths = worktreePaths.join("\0");
  if (wtPaths !== watchedWorktreePaths.get(projectId)) {
    watchedWorktreePaths.set(projectId, wtPaths);
    readBridge()
      .gitWatchWorktrees({
        projectId,
        worktreePaths,
      })
      .catch(() => undefined);
  }
  return worktreePaths;
}

export function syncWatchedWorktreeProjects(activeProjects: readonly ActiveGitProject[]): void {
  for (const project of activeProjects) {
    syncWatchedWorktreeProject(project.id);
  }
}

function getActiveWorktreeBranchThreads(projectId: string) {
  const activePaths = getProjectActiveWorktreePathSet(projectId);
  if (activePaths.size === 0) return [];
  return useAppStore.getState().threads.filter((thread) => {
    if (thread.projectId !== projectId || !thread.worktreePath || !thread.worktreeBranch) {
      return false;
    }
    return activePaths.has(thread.worktreePath);
  });
}

async function withRefreshTimeout<T>(
  projectId: string,
  reason: GitRefreshReason,
  task: Promise<T>,
): Promise<T | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `[git-refresh] timeout project=${projectId} reason=${reason} durationMs=${GIT_REFRESH_TIMEOUT_MS}`,
      );
      resolve(undefined);
    }, GIT_REFRESH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildPendingPrRefreshTargets(
  activeProjects: readonly ActiveGitProject[],
): Map<string, PendingPrRefreshTarget> {
  const targets = new Map<string, PendingPrRefreshTarget>();
  const gitState = useGitStore.getState();
  const appState = useAppStore.getState();

  function visitBranchPr(project: ActiveGitProject, prKey: string, branch: string) {
    const pr = gitState.prData[prKey];
    if (!pr) return;
    const detailsCacheKey = `${project.id}#${pr.number}`;
    const details = gitState.prDetails[detailsCacheKey];
    const detailsStatus = aggregatePrChecksStatus(details?.checks);
    const checksStatus = combineChecksStatus(detailsStatus, pr.checksStatus);
    if (pr.state !== "open" || checksStatus !== "PENDING") return;
    targets.set(detailsCacheKey, {
      projectId: project.id,
      projectLocation: project.location,
      prKey,
      branch,
      detailsCacheKey,
      prNumber: pr.number,
    });
  }

  for (const project of activeProjects) {
    const status = gitState.statuses[project.id];
    if (status?.branch) {
      visitBranchPr(project, buildBranchPrKey(project.id), status.branch);
    }
    const activeWorktreePaths = getProjectActiveWorktreePathSet(project.id);
    for (const thread of appState.threads) {
      if (thread.projectId !== project.id || !thread.worktreePath || !thread.worktreeBranch) {
        continue;
      }
      if (!activeWorktreePaths.has(thread.worktreePath)) continue;
      visitBranchPr(project, thread.worktreePath, thread.worktreeBranch);
    }
  }

  return targets;
}

function didPendingPrSettle(target: PendingPrRefreshTarget): boolean {
  const gitState = useGitStore.getState();
  const pr = gitState.prData[target.prKey];
  if (pr === null) return true;
  if (!pr || pr.number !== target.prNumber) return false;
  const detailsStatus = aggregatePrChecksStatus(gitState.prDetails[target.detailsCacheKey]?.checks);
  const checksStatus = combineChecksStatus(detailsStatus, pr.checksStatus);
  return checksStatus === "SUCCESS" || checksStatus === "FAILURE";
}

function requestSettledPrCheck(target: PendingPrRefreshTarget): void {
  void readBridge()
    .checkPrWatch({ projectId: target.projectId, prNumber: target.prNumber })
    .catch(() => undefined);
}

/**
 * Fetch a single PR's data (and its details, when a number + cache key are
 * known) and write both into the git store. Shared by the background
 * pending-PR poll and the on-demand refresh affordances (the PR block's
 * refresh icon and the worktree git panel's refresh button) so every surface
 * lands the same `setPrData` / `setPrDetails` shape. Network errors are
 * swallowed per request — a failed refresh leaves the cached snapshot intact.
 */
export async function refreshSinglePr(params: {
  projectLocation: ProjectLocation;
  prKey: string;
  branch: string;
  projectId?: string;
  detailsCacheKey?: string;
  prNumber?: number;
}): Promise<PrData | null | undefined> {
  const bridge = readBridge();
  const prPromise = bridge
    .ghGetPrForBranch({ projectLocation: params.projectLocation, branch: params.branch })
    .catch(() => undefined);
  const detailsPromise =
    params.detailsCacheKey && params.prNumber
      ? bridge
          .ghGetPrDetails({ projectLocation: params.projectLocation, prNumber: params.prNumber })
          .catch(() => undefined)
      : Promise.resolve(undefined);
  const [pr, details] = await Promise.all([prPromise, detailsPromise]);
  if (pr !== undefined) {
    useGitStore.getState().setPrData(params.prKey, pr);
  }
  if (params.detailsCacheKey && details) {
    useGitStore.getState().setPrDetails(params.detailsCacheKey, details.details);
  }
  if (!params.detailsCacheKey && params.projectId && pr && pr.number !== params.prNumber) {
    const discoveredDetails = await bridge
      .ghGetPrDetails({ projectLocation: params.projectLocation, prNumber: pr.number })
      .catch(() => undefined);
    if (discoveredDetails) {
      useGitStore
        .getState()
        .setPrDetails(`${params.projectId}#${pr.number}`, discoveredDetails.details);
    }
  }
  return pr;
}

async function refreshPendingPr(key: string): Promise<void> {
  const entry = pendingPrRefreshEntries.get(key);
  if (!entry || entry.inFlight) return;
  entry.inFlight = true;
  try {
    await refreshSinglePr(entry.target);
  } finally {
    const current = pendingPrRefreshEntries.get(key);
    if (current) current.inFlight = false;
    if (pendingPrRefreshActiveProjects.length > 0) {
      syncPendingPrRefreshProjects(pendingPrRefreshActiveProjects);
    }
  }
}

function isPostPushPrRefreshTargetActive(target: PostPushPrRefreshTarget): boolean {
  const gitState = useGitStore.getState();
  const pr = gitState.prData[target.prKey];
  if (!pr || pr.state !== "open") return false;
  const appState = useAppStore.getState();
  if (appState.projects.length > 0 && !appState.projects.some((p) => p.id === target.projectId)) {
    return false;
  }
  if (target.prKey === buildBranchPrKey(target.projectId)) {
    return gitState.statuses[target.projectId]?.branch === target.branch;
  }
  const activeWorktreePaths = getProjectActiveWorktreePathSet(target.projectId);
  return appState.threads.some(
    (thread) =>
      thread.projectId === target.projectId &&
      thread.worktreePath === target.prKey &&
      activeWorktreePaths.has(thread.worktreePath) &&
      thread.worktreeBranch === target.branch,
  );
}

async function refreshPostPushPr(key: string): Promise<void> {
  const entry = postPushPrRefreshEntries.get(key);
  if (!entry) return;
  if (!isPostPushPrRefreshTargetActive(entry.target)) {
    clearTimeout(entry.timeoutId);
    postPushPrRefreshEntries.delete(key);
    return;
  }

  entry.attempts += 1;
  const pr = await readBridge()
    .ghGetPrForBranch({
      projectLocation: entry.target.projectLocation,
      branch: entry.target.branch,
    })
    .catch(() => undefined);
  if (postPushPrRefreshEntries.get(key) !== entry) return;
  if (!isPostPushPrRefreshTargetActive(entry.target)) {
    postPushPrRefreshEntries.delete(key);
    return;
  }
  if (pr !== undefined) {
    entry.latest = pr;
    if (pr?.state === "open" && pr.checksStatus === "PENDING") {
      useGitStore.getState().setPrData(entry.target.prKey, pr);
      postPushPrRefreshEntries.delete(key);
      return;
    }
  }

  if (entry.attempts * PR_POST_PUSH_STATUS_POLL_MS >= PR_POST_PUSH_STATUS_WAIT_MS) {
    if (entry.latest !== undefined) {
      useGitStore.getState().setPrData(entry.target.prKey, entry.latest);
    }
    postPushPrRefreshEntries.delete(key);
    return;
  }

  entry.timeoutId = setTimeout(() => void refreshPostPushPr(key), PR_POST_PUSH_STATUS_POLL_MS);
}

export function startPostPushPrStatusRefresh(target: PostPushPrRefreshTarget): void {
  const currentPr = useGitStore.getState().prData[target.prKey];
  if (!currentPr || currentPr.state !== "open") return;
  const existing = postPushPrRefreshEntries.get(target.prKey);
  if (existing) clearTimeout(existing.timeoutId);
  postPushPrRefreshEntries.set(target.prKey, {
    target,
    timeoutId: setTimeout(() => void refreshPostPushPr(target.prKey), PR_POST_PUSH_STATUS_POLL_MS),
    attempts: 0,
    latest: undefined,
  });
}

export function syncPendingPrRefreshProjects(activeProjects: readonly ActiveGitProject[]): void {
  pendingPrRefreshActiveProjects = activeProjects;
  const targets = buildPendingPrRefreshTargets(activeProjects);
  for (const [key, entry] of pendingPrRefreshEntries) {
    const target = targets.get(key);
    if (!target) {
      clearInterval(entry.intervalId);
      pendingPrRefreshEntries.delete(key);
      if (
        activeProjects.some((project) => project.id === entry.target.projectId) &&
        didPendingPrSettle(entry.target)
      ) {
        requestSettledPrCheck(entry.target);
      }
      continue;
    }
    entry.target = target;
  }
  for (const [key, target] of targets) {
    if (pendingPrRefreshEntries.has(key)) continue;
    pendingPrRefreshEntries.set(key, {
      target,
      intervalId: setInterval(() => void refreshPendingPr(key), PR_PENDING_REFRESH_INTERVAL_MS),
      inFlight: false,
    });
    void refreshPendingPr(key);
  }
}

export function stopPendingPrRefresh(): void {
  pendingPrRefreshActiveProjects = [];
  for (const entry of pendingPrRefreshEntries.values()) {
    clearInterval(entry.intervalId);
  }
  pendingPrRefreshEntries.clear();
  for (const entry of postPushPrRefreshEntries.values()) {
    clearTimeout(entry.timeoutId);
  }
  postPushPrRefreshEntries.clear();
}

export function cleanupGitRefreshProjects(activeProjectIds: ReadonlySet<string>): void {
  for (const projectId of refreshingProjects) {
    if (!activeProjectIds.has(projectId)) refreshingProjects.delete(projectId);
  }
  for (const projectId of pendingWatcherRefreshProjects) {
    if (!activeProjectIds.has(projectId)) pendingWatcherRefreshProjects.delete(projectId);
  }
  for (const projectId of watchedWorktreePaths.keys()) {
    if (!activeProjectIds.has(projectId)) watchedWorktreePaths.delete(projectId);
  }
  for (const projectId of activeRefreshTokens.keys()) {
    if (!activeProjectIds.has(projectId)) activeRefreshTokens.delete(projectId);
  }
  for (const [key, entry] of postPushPrRefreshEntries) {
    if (activeProjectIds.has(entry.target.projectId)) continue;
    clearTimeout(entry.timeoutId);
    postPushPrRefreshEntries.delete(key);
  }
}

async function refreshProjectStatusOnly(
  project: { id: string; location: ProjectLocation },
  reason: GitRefreshReason,
  isActive: () => boolean,
): Promise<void> {
  const statusResult = await readBridge()
    .getGitStatus({ projectLocation: project.location })
    .catch(() => undefined);
  if (!isActive()) return;
  if (statusResult) {
    useGitStore.getState().setStatus(project.id, statusResult);
  }

  const threadWorktreePaths = getProjectActiveWorktreePaths(project.id);
  if (threadWorktreePaths.length === 0) return;
  const batch = await readBridge()
    .gitWorktreeStatusBatch({
      projectLocation: project.location,
      worktreePaths: threadWorktreePaths,
      detail: getWorktreeStatusDetail(reason, project.location),
    })
    .catch(() => undefined);
  if (!isActive() || !batch) return;
  if (Object.keys(batch.statuses).length > 0) {
    applyWorktreeStatusBatch(project.location, batch.statuses);
  }
}

export async function refreshGitProject(
  project: { id: string; location: ProjectLocation },
  reason: GitRefreshReason,
  mode: GitRefreshMode = "full",
  options: GitRefreshOptions = {},
): Promise<void> {
  const isActive = options.isActive ?? alwaysActive;
  if (!isActive()) return;
  if (refreshingProjects.has(project.id)) {
    if (reason === "watcher") {
      pendingWatcherRefreshProjects.add(project.id);
    }
    console.log(
      `[git-refresh] skip project=${project.id} reason=${reason} mode=${mode} inFlight=true`,
    );
    return;
  }
  const startedAt = Date.now();
  console.log(`[git-refresh] start project=${project.id} reason=${reason} mode=${mode}`);
  refreshingProjects.add(project.id);
  const refreshToken = Symbol(project.id);
  activeRefreshTokens.set(project.id, refreshToken);
  try {
    await withRefreshTimeout(
      project.id,
      reason,
      (async () => {
        if (options.fetchRemote) {
          try {
            await readBridge().gitFetch({
              projectLocation: project.location,
              remote: "origin",
              prune: false,
            });
          } catch {
            // ignore — remote may be unreachable
          }
          if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
        }

        if (mode === "status") {
          await refreshProjectStatusOnly(project, reason, () =>
            isRefreshCurrent(project.id, refreshToken, isActive),
          );
          return;
        }

        // One IPC round-trip pulls status + branches + worktrees (+ gh check
        // when not cached) via supervisor-side Promise.all. Cuts three IPC
        // handshakes to one and lets the supervisor parallelize freely. Each
        // field writes to the store as soon as the bundle lands.
        const cachedGhAvailable = useGitStore.getState().ghAvailable[project.id] === true;
        const snapshotPromise = readBridge()
          .gitProjectSnapshot({
            projectLocation: project.location,
            includeGhCheck: !cachedGhAvailable,
          })
          .then((snap) => {
            if (!isRefreshCurrent(project.id, refreshToken, isActive)) return snap;
            const store = useGitStore.getState();
            if (snap.status) store.setStatus(project.id, snap.status);
            if (snap.branches) store.setBranches(project.id, snap.branches);
            if (snap.worktrees) store.setWorktrees(project.id, snap.worktrees);
            if (snap.ghAvailable === true) store.setGhAvailable(project.id, true);
            return snap;
          })
          .catch((err) => {
            console.warn(`[git-refresh] gitProjectSnapshot failed project=${project.id}`, err);
            return null;
          });

        const statusPromise = snapshotPromise.then((snap) => snap?.status ?? undefined);
        const worktreesPromise = snapshotPromise.then((snap) => snap?.worktrees ?? undefined);

        // Once the snapshot has set gh availability + remote platform, bulk-prefetch
        // PR status for every branch (one gh call) for the branch-selector icons.
        // Fire-and-forget: it writes branch-keyed prData independently of this refresh.
        void snapshotPromise.then(() => {
          if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
          void prefetchBranchPrData(project);
        });

        const ghAvailablePromise: Promise<boolean> = cachedGhAvailable
          ? Promise.resolve(true)
          : snapshotPromise.then((snap) => {
              const platform = snap?.status?.remoteInfo?.platform;
              const mightBeGitHub = platform === "github" || platform === "unknown";
              if (!mightBeGitHub) return false;
              return snap?.ghAvailable === true;
            });

        // Worktree-derived work (per-worktree status + source branch) starts as
        // soon as `gitListWorktrees` returns — doesn't wait for status/branches.
        const worktreeWorkPromise = worktreesPromise.then(async (worktrees) => {
          if (!worktrees) return;
          if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
          const childWorktrees = worktrees.filter((wt) => !wt.isMain);
          const watchWorktreePaths = syncWatchedWorktreeProject(project.id);
          const watchedWorktreePathSet = new Set(watchWorktreePaths);
          const activeChildWorktrees = childWorktrees.filter((wt) =>
            watchedWorktreePathSet.has(wt.path),
          );

          const statusesPromise =
            (reason === "fetch" && project.location.kind !== "wsl") ||
            watchWorktreePaths.length === 0
              ? Promise.resolve()
              : readBridge()
                  .gitWorktreeStatusBatch({
                    projectLocation: project.location,
                    worktreePaths: watchWorktreePaths,
                    detail: getWorktreeStatusDetail(reason, project.location),
                  })
                  .then((batch) => {
                    if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
                    if (Object.keys(batch.statuses).length > 0) {
                      applyWorktreeStatusBatch(project.location, batch.statuses);
                    }
                  })
                  .catch(() => undefined);

          const sourceInfoPromise = Promise.all(
            activeChildWorktrees
              .filter((wt) => wt.branch)
              .map(async (wt) => {
                try {
                  const info = await readBridge().gitGetWorktreeSourceBranch({
                    projectLocation: project.location,
                    branch: wt.branch,
                  });
                  return [
                    wt.path,
                    {
                      sourceBranch: info.sourceBranch,
                      commitsAhead: info.commitsAhead,
                      sourceAhead: info.sourceAhead,
                    },
                  ] as const;
                } catch {
                  return undefined;
                }
              }),
          ).then((entries) => {
            if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
            const next = Object.fromEntries(entries.filter((e) => e !== undefined));
            if (Object.keys(next).length > 0) {
              useGitStore.getState().setWorktreeSourceInfoBatch(next);
            }
          });

          await Promise.all([statusesPromise, sourceInfoPromise]);
        });

        // PR fetches: each one starts the moment its prerequisites resolve.
        // Worktree-thread PRs only need `ghAvailable`; project PR also needs
        // `status.branch`. They run concurrently with everything above.
        const prUpdates: Record<string, PrData | null> = {};
        const prNumberUpdates = new Map<string, number | undefined>();
        const wtThreads = getActiveWorktreeBranchThreads(project.id);

        const wtPrPromises = wtThreads.map(async (t) => {
          const ghAvailable = await ghAvailablePromise;
          if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
          if (!ghAvailable || !t.worktreeBranch || !t.worktreePath) return;
          try {
            const pr = await readBridge().ghGetPrForBranch({
              projectLocation: project.location,
              branch: t.worktreeBranch,
            });
            prUpdates[t.worktreePath] = pr;
            const newPrNumber = pr?.number ?? undefined;
            if (newPrNumber !== t.prNumber) {
              prNumberUpdates.set(t.id, newPrNumber);
            }
          } catch (err) {
            console.warn(
              `[git-refresh] ghGetPrForBranch failed (worktree) project=${project.id} branch=${t.worktreeBranch}`,
              err,
            );
          }
        });

        const projectPrPromise = (async () => {
          const [status, ghAvailable] = await Promise.all([statusPromise, ghAvailablePromise]);
          if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
          if (!ghAvailable || !status?.branch) return;
          const platform = status.remoteInfo?.platform;
          if (platform !== "github" && platform !== "unknown") return;
          try {
            const pr = await readBridge().ghGetPrForBranch({
              projectLocation: project.location,
              branch: status.branch,
            });
            prUpdates[buildBranchPrKey(project.id)] = pr;
          } catch (err) {
            console.warn(
              `[git-refresh] ghGetPrForBranch failed (project) project=${project.id} branch=${status.branch}`,
              err,
            );
          }
        })();

        await Promise.all([
          snapshotPromise,
          worktreeWorkPromise,
          ...wtPrPromises,
          projectPrPromise,
        ]);

        if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
        if (Object.keys(prUpdates).length > 0) {
          useGitStore.getState().setPrDataBatch(prUpdates);
        }
        if (prNumberUpdates.size > 0) {
          useAppStore.setState((state) => {
            let changed = false;
            const nextThreads = state.threads.map((thread) => {
              if (!prNumberUpdates.has(thread.id)) return thread;
              const nextPrNumber = prNumberUpdates.get(thread.id);
              if (thread.prNumber === nextPrNumber) return thread;
              changed = true;
              return { ...thread, prNumber: nextPrNumber };
            });
            return changed ? { threads: nextThreads } : state;
          });
        }
      })(),
    );
  } finally {
    console.log(
      `[git-refresh] done project=${project.id} reason=${reason} mode=${mode} durationMs=${Date.now() - startedAt}`,
    );
    if (activeRefreshTokens.get(project.id) === refreshToken) {
      activeRefreshTokens.delete(project.id);
    }
    refreshingProjects.delete(project.id);
    if (pendingWatcherRefreshProjects.delete(project.id)) {
      const nextMode = getWatcherRefreshMode(project.id);
      console.log(`[git-refresh] rerun project=${project.id} reason=watcher mode=${nextMode}`);
      void refreshGitProject(project, "watcher", nextMode, options);
    }
  }
}
