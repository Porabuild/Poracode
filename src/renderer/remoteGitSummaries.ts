import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { RemoteGitSummaries, RemoteThreadGitSummary } from "@/shared/remote";

/**
 * Mirrors compact per-thread git/PR summaries to the main process so paired
 * browser clients can show diff stats and PR status. The renderer is the only
 * holder of live git state (`gitStore`, fed by the git watchers), so this is a
 * renderer→main push, debounced and deduplicated.
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

function buildThreadsSummaryKey(
  threads: ReturnType<typeof useAppStore.getState>["threads"],
): string {
  const parts: string[] = [];
  for (const thread of threads) {
    if (thread.archived) continue;
    parts.push(`${thread.id}\0${thread.projectId}\0${thread.worktreePath ?? ""}`);
  }
  return parts.join("\u0001");
}

export function installRemoteGitSummaryPublisher(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPublished = "";
  let lastThreadsKey = buildThreadsSummaryKey(useAppStore.getState().threads);

  const publish = () => {
    timer = null;
    if (!useSharedSettings.getState().remoteAccessEnabled) return;
    const summaries = buildSummaries();
    const serialized = JSON.stringify(summaries);
    if (serialized === lastPublished) return;
    lastPublished = serialized;
    readBridge()
      .publishRemoteGitSummaries({ summaries })
      .catch(() => {});
  };

  const schedule = () => {
    if (!useSharedSettings.getState().remoteAccessEnabled) return;
    if (timer !== null) return;
    timer = setTimeout(publish, PUBLISH_DEBOUNCE_MS);
  };

  const unsubGit = useGitStore.subscribe((state, prev) => {
    if (
      state.statuses !== prev.statuses ||
      state.worktreeStatuses !== prev.worktreeStatuses ||
      state.prData !== prev.prData
    ) {
      schedule();
    }
  });
  const unsubApp = useAppStore.subscribe((state, prev) => {
    if (state.threads === prev.threads) return;
    const nextKey = buildThreadsSummaryKey(state.threads);
    if (nextKey === lastThreadsKey) return;
    lastThreadsKey = nextKey;
    schedule();
  });
  const unsubSettings =
    typeof useSharedSettings.subscribe === "function"
      ? useSharedSettings.subscribe((state, prev) => {
          if (state.remoteAccessEnabled && !prev.remoteAccessEnabled) {
            schedule();
          }
        })
      : () => {};
  schedule();

  return () => {
    unsubGit();
    unsubApp();
    unsubSettings();
    if (timer !== null) clearTimeout(timer);
  };
}
