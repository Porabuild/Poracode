import { ChevronRight, GitBranch, GitPullRequest } from "lucide-react";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import { useGitSummariesStore } from "./gitSummaries";

/**
 * Git/PR affordances fed by the desktop's per-thread summaries: a compact badge
 * for thread rows, and a tappable bar inside an open thread that opens the
 * fullscreen git panel (file list, diffs, commit/sync, and PR actions).
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
  const pr = props.summary.pr;
  if (!pr || pr.state === "closed") return null;
  const tone = getPrStatusTone(pr.state, pr.checksStatus);
  return (
    <span className={`m-git-pr ${PR_TONE_TEXT_CLASS[tone]}`}>
      <GitPullRequest className="size-3 shrink-0" aria-label={`PR ${pr.state}`} />
      {props.withNumber ? <span>#{pr.number}</span> : null}
    </span>
  );
}

/** Inline diff/PR badge for thread list rows. */
export function GitSummaryBadge(props: { readonly threadId: string }) {
  const summary = useGitSummariesStore((s) => s.byThread[props.threadId]);
  if (!summary || !summary.isRepo) return null;
  return (
    <span className="m-git-badge">
      <DiffCounts summary={summary} />
      <PrGlyph summary={summary} />
    </span>
  );
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
  return (
    <span className="m-git-badge">
      <DiffCounts summary={summary} />
      <PrGlyph summary={summary} />
    </span>
  );
}

/** Subheader bar inside an open thread; tapping opens the fullscreen git panel. */
export function ThreadGitBar(props: {
  readonly threadId: string;
  readonly onOpen?: (() => void) | undefined;
}) {
  const summary = useGitSummariesStore((s) => s.byThread[props.threadId]);
  if (!summary || !summary.isRepo) return null;

  return (
    <button type="button" className="m-git-bar" onClick={props.onOpen} disabled={!props.onOpen}>
      <GitBranch className="size-3.5 shrink-0 text-muted" />
      <span className="m-git-bar__branch">{summary.branch || "(no branch)"}</span>
      {summary.ahead > 0 ? <span className="text-accent">↑{summary.ahead}</span> : null}
      {summary.behind > 0 ? <span className="text-accent">↓{summary.behind}</span> : null}
      <DiffCounts summary={summary} />
      <PrGlyph summary={summary} withNumber />
      <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted" />
    </button>
  );
}
