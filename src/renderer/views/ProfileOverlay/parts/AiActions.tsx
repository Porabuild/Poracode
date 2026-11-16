import { Skeleton } from "@heroui/react";
import { GitCommitHorizontal, GitMerge, GitPullRequest } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import type { AiActionType, ProfileAiAction } from "@/shared/contracts";

const ICONS: Record<AiActionType, typeof GitCommitHorizontal> = {
  commit: GitCommitHorizontal,
  pr: GitPullRequest,
  conflict: GitMerge,
};

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="flex items-center gap-2">
        <Skeleton className="size-3.5 rounded bg-foreground/10" />
        <Skeleton className="h-4 w-28 rounded bg-foreground/10" />
      </span>
      <Skeleton className="h-4 w-10 rounded bg-foreground/10" />
    </div>
  );
}

/** AI-performed git actions (commits / PRs / conflict resolutions). */
export function AiActions(props: { actions: ProfileAiAction[]; loading?: boolean }) {
  const { actions, loading = false } = props;

  return (
    <section className="flex flex-col gap-1">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        <Trans>AI git actions</Trans>
      </h2>
      {loading && actions.length === 0 ? (
        <div className="divide-y divide-separator">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <p className="py-2 text-sm text-muted">
          <Trans>No AI commits, PRs, or conflict resolutions tracked yet.</Trans>
        </p>
      ) : (
        <div className="divide-y divide-separator">
          {actions.map((action) => {
            const Icon = ICONS[action.type];
            const via = action.topProvider
              ? `${action.topProvider}${action.topModel ? ` - ${action.topModel}` : ""}`
              : null;
            return (
              <div
                key={action.type}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate font-medium text-foreground">{action.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {via ? <span className="text-[11px] text-muted/70">{via}</span> : null}
                  <span className="font-medium tabular-nums text-foreground">
                    {action.count.toLocaleString()}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
