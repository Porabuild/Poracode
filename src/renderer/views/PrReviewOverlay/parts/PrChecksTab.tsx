import { CheckCircle2, Clock, ExternalLink, Workflow, XCircle } from "lucide-react";
import { Link } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader, PrCheckStatusText } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { parseGitHubActionsRunId } from "@/renderer/utils/githubActions";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import {
  countPassedPrChecks,
  getPrCheckPresentation,
  PR_CHECK_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";

const TONE_ICON = {
  success: CheckCircle2,
  danger: XCircle,
  warning: Clock,
  neutral: Clock,
} as const;

export function PrChecksTab(props: { cacheKey: string; loading: boolean; projectId: string }) {
  const { cacheKey, loading, projectId } = props;
  const { t } = useLingui();
  const openGitHubActions = useAppStore((state) => state.openGitHubActions);
  const closePrReview = usePanelStore((state) => state.setPrReviewContext);
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const checks = details?.checks;

  if (loading && !details) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="md" />
      </div>
    );
  }

  if (!checks || checks.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-xs text-muted/60">
        <Trans>No checks reported for this PR.</Trans>
      </div>
    );
  }

  const passed = countPassedPrChecks(checks);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          <Trans>
            <span className="text-foreground">{passed}</span> of {checks.length} checks passed
          </Trans>
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30">
        {checks.map((check, idx) => {
          const tone = getPrCheckPresentation(check).tone;
          const Icon = TONE_ICON[tone];
          const runId = check.url ? parseGitHubActionsRunId(check.url) : null;
          return (
            <li
              key={`${check.name}-${idx}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-foreground/[0.03]"
            >
              <Icon className={`size-4 shrink-0 ${PR_CHECK_TONE_TEXT_CLASS[tone]}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{check.name}</div>
                {check.workflowName && (
                  <div className="mt-0.5 truncate text-[11px] text-muted">{check.workflowName}</div>
                )}
              </div>
              <PrCheckStatusText check={check} className="shrink-0 text-[11px]" />
              {runId ? (
                <Link
                  aria-label={t`Open run in GitHub Actions`}
                  className="shrink-0 text-muted hover:text-foreground"
                  onPress={() => {
                    closePrReview(null);
                    openGitHubActions(projectId, runId);
                  }}
                >
                  <Workflow className="size-3.5" />
                </Link>
              ) : null}
              {check.url ? (
                <Link
                  aria-label={t`Open check`}
                  className="shrink-0 text-muted hover:text-foreground"
                  onPress={() => openExternalWithFeedback(check.url!)}
                >
                  <ExternalLink className="size-3.5" />
                </Link>
              ) : (
                <span className="size-3.5 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
