import { useState } from "react";
import { CheckCircle2, Clock, Workflow, XCircle } from "lucide-react";
import { Link } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { PrCheckStatusText } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { parseGitHubActionsRunId } from "@/renderer/utils/githubActions";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import {
  countPassedPrChecks,
  getPrCheckPresentation,
  PR_CHECK_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";
import { usePrDetailScope } from "../detail/prDetailScope";
import { RailSection } from "./RailSection";

const COLLAPSED_COUNT = 5;

const TONE_ICON = {
  success: CheckCircle2,
  danger: XCircle,
  warning: Clock,
  neutral: Clock,
} as const;

/** Status checks; the first few are shown and the rest expand in place. */
export function RailChecks() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const openGitHubActions = useAppStore((state) => state.openGitHubActions);
  const checks = useGitStore((s) => s.prDetails[scope.cacheKey]?.checks);
  const [expanded, setExpanded] = useState(false);
  if (!checks || checks.length === 0) return null;
  const hidden = Math.max(0, checks.length - COLLAPSED_COUNT);
  const visible = expanded ? checks : checks.slice(0, COLLAPSED_COUNT);
  const passed = countPassedPrChecks(checks);

  return (
    <RailSection
      title={<Trans>Checks</Trans>}
      action={
        <span className="text-[11px] text-muted">
          <Trans>
            {passed} of {checks.length} passed
          </Trans>
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {visible.map((check, index) => {
          const tone = getPrCheckPresentation(check).tone;
          const Icon = TONE_ICON[tone];
          const url = check.url;
          const runId = url ? parseGitHubActionsRunId(url) : null;
          return (
            <li key={`${check.name}-${index}`} className="flex items-start gap-2 text-xs">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${PR_CHECK_TONE_TEXT_CLASS[tone]}`} />
              <div className="min-w-0 flex-1">
                {url ? (
                  <Link
                    aria-label={t`Open check ${check.name}`}
                    className="block max-w-full truncate font-medium text-foreground no-underline hover:underline"
                    onPress={() => openExternalWithFeedback(url)}
                  >
                    {check.name}
                  </Link>
                ) : (
                  <div className="truncate font-medium text-foreground">{check.name}</div>
                )}
                <PrCheckStatusText check={check} className="text-[11px]" />
              </div>
              {runId ? (
                <Link
                  aria-label={t`Open run in GitHub Actions`}
                  className="shrink-0 text-muted hover:text-foreground"
                  onPress={() => {
                    scope.onClose();
                    openGitHubActions(scope.projectId, runId);
                  }}
                >
                  <Workflow className="size-3.5" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="w-fit cursor-pointer text-[11px] text-muted hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <Trans>Show fewer</Trans> : <Plural value={hidden} other="Show # more" />}
        </button>
      ) : null}
    </RailSection>
  );
}
