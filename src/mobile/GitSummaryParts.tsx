import { useLingui } from "@lingui/react/macro";
import { Folder, GitBranch, GitPullRequest } from "lucide-react";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import type { WorkspaceTab } from "./views/WorkspaceView";
import { useGitSummariesStore } from "./gitSummaries";

/**
 * Git/PR affordances fed by the desktop's per-thread summaries: a compact badge
 * for thread rows, and a tappable chip in the thread title bar that opens the
 * unified workspace panel (changes, diffs, commit/sync, PR actions, and the
 * project file tree) — all behind a single entry point.
 */

function DiffCounts(props: { readonly summary: RemoteThreadGitSummary }) {
  const { totalInsertions, totalDeletions } = props.summary;
  if (totalInsertions === 0 && totalDeletions === 0) return null;
  return (
    <span className="m-git-counts">
      {totalInsertions > 0 ? <span className="text-success">+{totalInsertions}</span> : null}
      {totalDeletions > 0 ? <span className="text-danger">−{totalDeletions}</span> : null}
    </span>
  );
}

function PrGlyph(props: {
  readonly summary: RemoteThreadGitSummary;
  readonly withNumber?: boolean;
}) {
  const { t } = useLingui();
  const pr = props.summary.pr;
  if (!pr || pr.state === "closed") return null;
  const tone = getPrStatusTone(pr.state, pr.checksStatus);
  return (
    <span className={`m-git-pr ${PR_TONE_TEXT_CLASS[tone]}`}>
      <GitPullRequest className="size-3 shrink-0" aria-label={t`Pull request ${pr.state}`} />
      {props.withNumber ? <span>#{pr.number}</span> : null}
    </span>
  );
}

function Badge(props: { readonly summary: RemoteThreadGitSummary }) {
  return (
    <span className="m-git-badge">
      <DiffCounts summary={props.summary} />
      <PrGlyph summary={props.summary} />
    </span>
  );
}

/** Inline diff/PR badge for thread list rows. */
export function GitSummaryBadge(props: { readonly threadId: string }) {
  const summary = useGitSummariesStore((s) => s.byThread[props.threadId]);
  if (!summary || !summary.isRepo) return null;
  return <Badge summary={summary} />;
}

/**
 * Diff/PR badge for a worktree group header. Threads in one worktree share a
 * working dir, so their summaries match; we render the first available one and
 * let the member rows drop their own badge.
 */
export function WorktreeGitSummaryBadge(props: { readonly threadIds: readonly string[] }) {
  const byThread = useGitSummariesStore((s) => s.byThread);
  const summary = props.threadIds.map((id) => byThread[id]).find((entry) => entry?.isRepo);
  if (!summary) return null;
  return <Badge summary={summary} />;
}

/**
 * The single full-width bar — its own row under the thread header — that is the
 * one entry point to the unified workspace panel. It surfaces the project,
 * branch, diffstat and PR (its number tinted by status) at a glance, and opens
 * the panel on the Changes tab for a repo or the Files tab otherwise. Non-git
 * threads show just the project so the file tree stays reachable.
 */
export function WorkspaceChip(props: {
  readonly threadId: string;
  readonly projectLabel: string;
  readonly onOpen: (tab: WorkspaceTab) => void;
}) {
  const { t } = useLingui();
  const summary = useGitSummariesStore((s) => s.byThread[props.threadId]);
  const isRepo = summary?.isRepo === true;

  return (
    <button
      type="button"
      className="m-ws-chip"
      onClick={() => props.onOpen(isRepo ? "changes" : "files")}
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
            <span className="m-ws-chip__branch">{summary.branch || t`(no branch)`}</span>
          </>
        ) : null}
      </span>
      {isRepo ? (
        <span className="m-ws-chip__meta">
          {summary.ahead > 0 ? (
            <span className="shrink-0 text-accent">↑{summary.ahead}</span>
          ) : null}
          {summary.behind > 0 ? (
            <span className="shrink-0 text-accent">↓{summary.behind}</span>
          ) : null}
          <DiffCounts summary={summary} />
          <PrGlyph summary={summary} withNumber />
        </span>
      ) : null}
    </button>
  );
}
