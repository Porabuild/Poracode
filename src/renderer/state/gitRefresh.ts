import type { PrData, ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { aggregatePrChecksStatus, combineChecksStatus } from "@/renderer/utils/prStatus";

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

const alwaysActive = () => true;

type ActiveGitProject = { id: string; location: ProjectLocation };

interface PendingPrRefreshTarget {
  projectLocation: ProjectLocation;
  prKey: string;
  branch: string;
  detailsCacheKey?: string;
  prNumber?: number;
}

interface PendingPrRefreshEntry {
  target: PendingPrRefreshTarget;
  intervalId: ReturnType<typeof setInterval>;
  inFlight: boolean;
}

const pendingPrRefreshEntries = new Map<string, PendingPrRefreshEntry>();
let pendingPrRefreshActiveProjects: readonly ActiveGitProject[] = [];

function isRefreshCurrent(projectId: string, token: symbol, isActive: () => boolean): boolean {
  return isActive() && activeRefreshTokens.get(projectId) === token;
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
    const detailsCacheKey = pr.number ? `${project.id}#${pr.number}` : undefined;
    const details = detailsCacheKey ? gitState.prDetails[detailsCacheKey] : undefined;
    const detailsStatus = aggregatePrChecksStatus(details?.checks);
    const checksStatus = combineChecksStatus(detailsStatus, pr.checksStatus);
    if (pr.state !== "open" || checksStatus !== "PENDING") return;
    targets.set(detailsCacheKey ?? prKey, {
      projectLocation: project.location,
      prKey,
      branch,
      ...(detailsCacheKey ? { detailsCacheKey } : {}),
      ...(pr.number ? { prNumber: pr.number } : {}),
    });
  }

  for (const project of activeProjects) {
    const status = gitState.statuses[project.id];
    if (status?.branch) {
      visitBranchPr(project, buildBranchPrKey(project.id), status.branch);
    }
    for (const thread of appState.threads) {
      if (thread.projectId !== project.id || !thread.worktreePath || !thread.worktreeBranch) {
        continue;
      }
      visitBranchPr(project, thread.worktreePath, thread.worktreeBranch);
    }
  }

  return targets;
}

async function refreshPendingPr(key: string): Promise<void> {
  const entry = pendingPrRefreshEntries.get(key);
  if (!entry || entry.inFlight) return;
  entry.inFlight = true;
  try {
    const { target } = entry;
    const bridge = readBridge();
    const prPromise = bridge
      .ghGetPrForBranch({ projectLocation: target.projectLocation, branch: target.branch })
      .catch(() => undefined);
    const detailsPromise =
      target.detailsCacheKey && target.prNumber
        ? bridge
            .ghGetPrDetails({
              projectLocation: target.projectLocation,
              prNumber: target.prNumber,
            })
            .catch(() => undefined)
        : Promise.resolve(undefined);
    const [pr, details] = await Promise.all([prPromise, detailsPromise]);
    if (pr !== undefined) {
      useGitStore.getState().setPrData(target.prKey, pr);
    }
    if (target.detailsCacheKey && details) {
      useGitStore.getState().setPrDetails(target.detailsCacheKey, details.details);
    }
  } finally {
    const current = pendingPrRefreshEntries.get(key);
    if (current) current.inFlight = false;
    if (pendingPrRefreshActiveProjects.length > 0) {
      syncPendingPrRefreshProjects(pendingPrRefreshActiveProjects);
    }
  }
}

export function syncPendingPrRefreshProjects(activeProjects: readonly ActiveGitProject[]): void {
  pendingPrRefreshActiveProjects = activeProjects;
  const targets = buildPendingPrRefreshTargets(activeProjects);
  for (const [key, entry] of pendingPrRefreshEntries) {
    const target = targets.get(key);
    if (!target) {
      clearInterval(entry.intervalId);
      pendingPrRefreshEntries.delete(key);
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
}

async function refreshProjectStatusOnly(
  project: { id: string; location: ProjectLocation },
  isActive: () => boolean,
): Promise<void> {
  const statusResult = await readBridge()
    .getGitStatus({ projectLocation: project.location })
    .catch(() => undefined);
  if (!isActive()) return;
  if (statusResult) {
    useGitStore.getState().setStatus(project.id, statusResult);
  }

  const cachedWorktrees = useGitStore.getState().worktrees[project.id];
  if (!cachedWorktrees || cachedWorktrees.length === 0) return;
  const childWorktreePaths = cachedWorktrees.filter((wt) => !wt.isMain).map((wt) => wt.path);
  if (childWorktreePaths.length === 0) return;
  const batch = await readBridge()
    .gitWorktreeStatusBatch({
      projectLocation: project.location,
      worktreePaths: childWorktreePaths,
    })
    .catch(() => undefined);
  if (!isActive() || !batch) return;
  if (Object.keys(batch.statuses).length > 0) {
    useGitStore.getState().setWorktreeStatuses(batch.statuses);
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
          await refreshProjectStatusOnly(project, () =>
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

          const wtPaths = childWorktrees
            .map((wt) => wt.path)
            .sort()
            .join("\0");
          if (wtPaths !== watchedWorktreePaths.get(project.id)) {
            watchedWorktreePaths.set(project.id, wtPaths);
            readBridge()
              .gitWatchWorktrees({
                projectId: project.id,
                worktreePaths: childWorktrees.map((wt) => wt.path),
              })
              .catch(() => undefined);
          }

          const statusesPromise = readBridge()
            .gitWorktreeStatusBatch({
              projectLocation: project.location,
              worktreePaths: childWorktrees.map((wt) => wt.path),
            })
            .then((batch) => {
              if (!isRefreshCurrent(project.id, refreshToken, isActive)) return;
              if (Object.keys(batch.statuses).length > 0) {
                useGitStore.getState().setWorktreeStatuses(batch.statuses);
              }
            })
            .catch(() => undefined);

          const sourceInfoPromise = Promise.all(
            childWorktrees
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
        const currentThreads = useAppStore.getState().threads;
        const wtThreads = currentThreads.filter(
          (t) => t.projectId === project.id && t.worktreeBranch && t.worktreePath,
        );

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
      console.log(`[git-refresh] rerun project=${project.id} reason=watcher mode=status`);
      void refreshGitProject(project, "watcher", "status", options);
    }
  }
}
