import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import type { GitStatusResult, Project, Thread } from "@/shared/contracts";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useGitSummariesStore } from "./gitSummaries";

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

  useEffect(() => {
    if (!thread || !project || cached) return;
    let cancelled = false;
    const projectLocation = thread.worktreePath
      ? buildWorktreeLocation(project.location, thread.worktreePath)
      : project.location;

    let bridge: ReturnType<typeof readBridge>;
    try {
      bridge = readBridge();
    } catch {
      return;
    }
    if (typeof bridge.getGitStatus !== "function") return;

    void Promise.resolve()
      .then(() => bridge.getGitStatus({ projectLocation }))
      .then((status) => {
        if (cancelled) return;
        updateMobileGitSummary(thread, project, status);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [thread, project, cached]);
}
