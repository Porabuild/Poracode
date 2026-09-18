import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import type { RemoteGitSummaries, RemoteThreadGitSummary } from "@/shared/remote";

/**
 * Mirrors compact per-thread git/PR summaries to the main process so paired
 * paired browser clients can show diff stats and PR status. The
 * renderer is the only holder of live git state (gitStore, fed by the git
 * watchers), so this is a renderer→main push, debounced and deduplicated.
 */

const PUBLISH_DEBOUNCE_MS = 500;

function buildSummaries(): RemoteGitSummaries {
  const git = useGitStore.getState();
  const threads = useAppStore.getState().threads;
  const summaries: RemoteGitSummaries = {};
  for (const thread of threads) {
    if (thread.archived) continue;
    const status = thread.worktreePath
      ? git.worktreeStatuses[thread.worktreePath]
      : git.statuses[thread.projectId];
    if (!status) continue;
    const pr = git.prData[resolvePrKey(thread.projectId, thread.worktreePath)] ?? null;
    const summary: RemoteThreadGitSummary = {
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
    summaries[thread.id] = summary;
  }
  return summaries;
}

export function installRemoteGitSummaryPublisher(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPublished = "";

  const publish = () => {
    timer = null;
    const summaries = buildSummaries();
    const serialized = JSON.stringify(summaries);
    if (serialized === lastPublished) return;
    lastPublished = serialized;
    readBridge()
      .publishRemoteGitSummaries({ summaries })
      .catch(() => {});
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(publish, PUBLISH_DEBOUNCE_MS);
  };

  const unsubGit = useGitStore.subscribe(schedule);
  const unsubApp = useAppStore.subscribe((state, prev) => {
    if (state.threads !== prev.threads) schedule();
  });
  schedule();

  return () => {
    unsubGit();
    unsubApp();
    if (timer !== null) clearTimeout(timer);
  };
}
