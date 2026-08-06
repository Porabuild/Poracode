import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { refreshSinglePr } from "@/renderer/state/gitRefresh";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { useGitReadModelStore } from "@/renderer/state/gitReadModelStore";
import type { GitStatusResult, PrData, Project, ProjectLocation, Thread } from "@/shared/contracts";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useGitSummariesStore } from "./gitSummaries";

const GIT_STATUS_BRIDGE_RETRY_DELAY_MS = 250;
const GIT_STATUS_BRIDGE_RETRY_LIMIT = 40;

function prSummaryFromData(pr: PrData | null): RemoteThreadGitSummary["pr"] {
  if (!pr) return null;
  return {
    number: pr.number,
    state: pr.state,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    ...(pr.checksStatus ? { checksStatus: pr.checksStatus } : {}),
  };
}

/**
 * Fetch the authoritative PR for a mobile thread from its paired host and
 * hydrate both caches used by the PWA: the reused desktop Git panel reads
 * gitStore, while thread/workspace badges read gitSummariesStore.
 */
export async function refreshMobilePrData(input: {
  readonly projectId: string;
  readonly projectLocation: ProjectLocation;
  readonly branch: string;
  readonly prKey: string;
  readonly prNumber?: number | undefined;
  readonly threadId?: string | undefined;
}): Promise<PrData | null | undefined> {
  try {
    const currentPrNumber = useGitStore.getState().prData[input.prKey]?.number;
    const prNumber = input.prNumber ?? currentPrNumber;
    const pr = await refreshSinglePr({
      projectId: input.projectId,
      projectLocation: input.projectLocation,
      branch: input.branch,
      prKey: input.prKey,
      ...(prNumber
        ? {
            prNumber,
            detailsCacheKey: `${input.projectId}#${prNumber}`,
          }
        : {}),
    });
    if (pr === undefined) return undefined;
    if (input.threadId) {
      useGitSummariesStore.getState().setThreadPr(input.threadId, prSummaryFromData(pr));
    }
    return pr;
  } catch {
    return undefined;
  }
}

function summaryFromStatus(thread: Thread, status: GitStatusResult): RemoteThreadGitSummary {
  const pr =
    useGitStore.getState().prData[resolvePrKey(thread.projectId, thread.worktreePath)] ?? null;
  return {
    isRepo: status.isRepo,
    branch: status.branch,
    totalInsertions: status.totalInsertions,
    totalDeletions: status.totalDeletions,
    ahead: status.ahead,
    behind: status.behind,
    pr:
      pr === null
        ? null
        : {
            number: pr.number,
            state: pr.state,
            title: pr.title,
            url: pr.url,
            isDraft: pr.isDraft,
            ...(pr.checksStatus ? { checksStatus: pr.checksStatus } : {}),
          },
  };
}

export function updateMobileGitSummary(
  thread: Thread,
  project: Project,
  status: GitStatusResult,
): void {
  const gitStore = useGitStore.getState();
  if (thread.worktreePath) gitStore.setWorktreeStatus(thread.worktreePath, status);
  else gitStore.setStatus(project.id, status);
  useGitSummariesStore.getState().setThread(thread.id, summaryFromStatus(thread, status));
}

export function useGitSummaryHydration(
  thread: Thread | null | undefined,
  project: Project | null | undefined,
): void {
  const cached = useGitSummariesStore((s) => (thread ? s.byThread[thread.id] : undefined));
  const cachedBranch = cached?.isRepo ? cached.branch : undefined;
  const hasKnownPr = Boolean(cached?.pr || thread?.prNumber);
  const prKey = thread ? resolvePrKey(thread.projectId, thread.worktreePath) : undefined;
  const hydratedPr = useGitStore((state) => (prKey ? state.prData[prKey] : undefined));
  const hostGitStateAvailable = useGitReadModelStore((state) => state.hostAvailable);
  const cachedPrFingerprint = JSON.stringify(cached?.pr ?? null);
  const cachedPrNumber = cached?.pr?.number;
  const hydratedPrFingerprint = JSON.stringify(prSummaryFromData(hydratedPr ?? null));

  useEffect(() => {
    if (!thread || !project || cached || hostGitStateAvailable) return;
    const currentThread = thread;
    const currentProject = project;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const projectLocation = currentThread.worktreePath
      ? buildWorktreeLocation(currentProject.location, currentThread.worktreePath)
      : currentProject.location;

    function retry() {
      if (cancelled || attempts >= GIT_STATUS_BRIDGE_RETRY_LIMIT) return;
      attempts += 1;
      retryTimer = setTimeout(attempt, GIT_STATUS_BRIDGE_RETRY_DELAY_MS);
    }

    function attempt() {
      if (cancelled || useGitSummariesStore.getState().byThread[currentThread.id]) return;

      let bridge: ReturnType<typeof readBridge>;
      try {
        bridge = readBridge();
      } catch {
        retry();
        return;
      }
      if (typeof bridge.getGitStatus !== "function") return;

      void Promise.resolve()
        .then(() => bridge.getGitStatus({ projectLocation }))
        .then((status) => {
          if (cancelled) return;
          updateMobileGitSummary(currentThread, currentProject, status);
        })
        .catch(() => retry());
    }

    attempt();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [thread, project, cached, hostGitStateAvailable]);

  // The compact desktop summary powers the thread header, but the reused Git
  // panel reads full PR data from gitStore. Refresh known PRs on the phone so a
  // worktree panel does not fall back to "Create PR" or retain stale checks.
  useEffect(() => {
    if (hostGitStateAvailable || !thread || !project || !cachedBranch || !hasKnownPr) return;
    if (cachedPrFingerprint === hydratedPrFingerprint) return;
    useGitStore.getState().setGhAvailable(project.id, true);
    void refreshMobilePrData({
      projectId: project.id,
      projectLocation: project.location,
      branch: cachedBranch,
      prKey: resolvePrKey(thread.projectId, thread.worktreePath),
      ...(cachedPrNumber ? { prNumber: cachedPrNumber } : {}),
      threadId: thread.id,
    });
  }, [
    cachedBranch,
    cachedPrFingerprint,
    cachedPrNumber,
    hasKnownPr,
    hostGitStateAvailable,
    hydratedPrFingerprint,
    project,
    thread,
  ]);
}
