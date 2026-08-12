import { useLingui } from "@lingui/react/macro";
import { Folder, GitBranch, GitPullRequest } from "lucide-react";
import type { Thread } from "@/shared/contracts";
import { openFilesPanel, showGitReviewPanel } from "@/renderer/actions/panelActions";
import { useGitStore } from "@/renderer/state/gitStore";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";

export function CompactThreadWorkspaceBar(props: { thread: Thread; projectLabel: string }) {
  const { t } = useLingui();
  const { thread } = props;
  const status = useGitStore((state) =>
    thread.worktreePath
      ? state.worktreeStatuses[thread.worktreePath]
      : state.statuses[thread.projectId],
  );
  const pr = useGitStore(
    (state) => state.prData[resolvePrKey(thread.projectId, thread.worktreePath)],
  );
  const isRepo = status?.isRepo === true;
  const hasVisiblePr = pr && pr.state !== "closed";
  const prTone = hasVisiblePr ? getPrStatusTone(pr.state, pr.checksStatus) : null;

  return (
    <div className="m-thread-bar">
      <button
        type="button"
        className="m-ws-chip"
        onClick={() => {
          if (isRepo) {
            showGitReviewPanel(thread.projectId, thread.worktreePath);
          } else {
            openFilesPanel(thread.projectId, thread.worktreePath);
          }
        }}
      >
        {isRepo ? (
          <GitBranch className="size-4 shrink-0 text-muted" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted" />
        )}
        <span className="m-ws-chip__main">
          {props.projectLabel ? (
            <span className="m-ws-chip__project">{props.projectLabel}</span>
          ) : null}
          {isRepo ? (
            <>
              {props.projectLabel ? <span className="m-ws-chip__sep">/</span> : null}
              <span className="m-ws-chip__branch">{status.branch || t`(no branch)`}</span>
            </>
          ) : null}
        </span>
        {isRepo ? (
          <span className="m-ws-chip__meta">
            {status.ahead > 0 ? (
              <span className="shrink-0 text-accent">↑{status.ahead}</span>
            ) : null}
            {status.behind > 0 ? (
              <span className="shrink-0 text-accent">↓{status.behind}</span>
            ) : null}
            {status.totalInsertions > 0 || status.totalDeletions > 0 ? (
              <span className="m-git-counts">
                {status.totalInsertions > 0 ? (
                  <span className="text-success">+{status.totalInsertions}</span>
                ) : null}
                {status.totalDeletions > 0 ? (
                  <span className="text-danger">−{status.totalDeletions}</span>
                ) : null}
              </span>
            ) : null}
            {hasVisiblePr && prTone ? (
              <span className={`m-git-pr ${PR_TONE_TEXT_CLASS[prTone]}`}>
                <GitPullRequest
                  className="size-3 shrink-0"
                  aria-label={t`Pull request ${pr.state}`}
                />
                <span>#{pr.number}</span>
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    </div>
  );
}
