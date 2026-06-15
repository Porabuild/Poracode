import { GitCommitHorizontal, GitMerge, GitPullRequest } from "lucide-react";
import type { AiActionType, ProfileAiAction } from "@/shared/contracts";

const ICONS: Record<AiActionType, typeof GitCommitHorizontal> = {
  commit: GitCommitHorizontal,
  pr: GitPullRequest,
  conflict: GitMerge,
};

/** AI-performed git actions (commits / PRs / conflict resolutions). */
export function AiActions(props: { actions: ProfileAiAction[] }) {
  const { actions } = props;

  return (
    <section className="flex flex-col gap-1">
      <h2 className="mb-1 text-sm font-semibold text-foreground">AI git actions</h2>
      {actions.length === 0 ? (
        <p className="py-2 text-sm text-muted">
          No AI commits, PRs, or conflict resolutions tracked yet.
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
