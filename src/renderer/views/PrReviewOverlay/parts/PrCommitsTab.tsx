import { ExternalLink, GitCommit } from "lucide-react";
import { Link } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { PrCommitSummary } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrUrl } from "@/renderer/state/gitSelectors";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";

export function PrCommitsTab(props: { cacheKey: string; prKey: string; loading: boolean }) {
  const { cacheKey, prKey, loading } = props;
  const { t } = useLingui();
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const prUrl = usePrUrl(prKey);
  const commits = details?.commits ?? [];

  if (loading && !details) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="md" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-xs text-muted/60">{t`No commits found.`}</div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-3">
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30">
        {commits.map((c) => (
          <PrCommitRow key={c.oid} commit={c} prUrl={prUrl} />
        ))}
      </ul>
    </div>
  );
}

function PrCommitRow(props: { commit: PrCommitSummary; prUrl: string | undefined }) {
  const { commit, prUrl } = props;
  const { t } = useLingui();
  // gh's commits payload doesn't include a direct commit URL — build one from the PR URL.
  const commitUrl = (() => {
    if (commit.url) return commit.url;
    if (!prUrl) return undefined;
    const match = prUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/pull\/\d+/);
    return match ? `${match[1]}/commit/${commit.oid}` : undefined;
  })();
  return (
    <li className="flex items-start gap-3 px-3 py-2 hover:bg-foreground/[0.03]">
      <GitCommit className="mt-0.5 size-4 shrink-0 text-muted/70" />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium text-foreground"
          title={commit.messageHeadline}
        >
          {commit.messageHeadline || t`(no message)`}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          {commit.author?.login && <span className="text-foreground">{commit.author.login}</span>}
          {commit.authoredDate && <span>· {formatShortDateTime(commit.authoredDate)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {commit.abbreviatedOid}
        </code>
        {commitUrl && (
          <Link
            aria-label={t`Open commit on GitHub`}
            className="text-muted hover:text-foreground"
            onPress={() => openExternalWithFeedback(commitUrl)}
          >
            <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}
