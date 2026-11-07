import { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Tooltip, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { pollPullRequests } from "@/renderer/state/githubPolling";
import { useGitStore } from "@/renderer/state/gitStore";
import { friendlyError } from "@/shared/messages";

export function GithubPollingNotice({
  project,
  onRecovered,
}: {
  project: Project;
  onRecovered: () => void;
}) {
  const { t } = useLingui();
  const problem = useGitStore((state) => state.githubPollingProblems[project.id]);
  const [retrying, setRetrying] = useState(false);
  if (!problem) return null;
  const { executionHost } = problem;
  async function retry() {
    setRetrying(true);
    try {
      const result = await pollPullRequests(
        { projectLocation: project.location, retry: true },
        project.id,
      );
      if (result.status === "ready") onRecovered();
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setRetrying(false);
    }
  }
  const summary = <Trans>PR data is unavailable; cached results may be stale.</Trans>;
  return (
    <div
      role="status"
      className="flex h-8 items-center gap-1.5 border-t border-[var(--hairline)] px-3 text-xs"
      data-testid="github-polling-problem"
    >
      <Tooltip delay={300}>
        <Tooltip.Trigger className="flex min-w-0 flex-1 items-center gap-1.5">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 truncate text-warning">{summary}</span>
        </Tooltip.Trigger>
        <Tooltip.Content placement="top" className="max-w-72">
          <div className="flex flex-col gap-1 break-words">
            <p className="font-medium">{summary}</p>
            <p>
              {problem.kind === "authentication" ? (
                <Trans>
                  Run gh auth login in a terminal on {executionHost}, then retry. If GH_TOKEN or
                  GITHUB_TOKEN is set, update or remove the invalid token there.
                </Trans>
              ) : (
                <Trans>Install GitHub CLI (gh) on {executionHost}, then retry.</Trans>
              )}
            </p>
          </div>
        </Tooltip.Content>
      </Tooltip>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="shrink-0"
        aria-label={t`Retry`}
        isPending={retrying}
        onPress={() => void retry()}
      >
        <RefreshCw className="size-3.5" />
      </Button>
    </div>
  );
}
