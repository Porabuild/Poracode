import { Gauge, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import type { ThreadCrewBinding } from "@/shared/crew";
import {
  ThreadDockBody,
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockSection,
} from "./ThreadDockUI";
import { ThreadSpendDetails } from "./ThreadSpendDetails";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

export function ThreadContextDock({
  summary,
  onClose,
  threadId,
  crewBinding,
}: {
  summary: ThreadContextUsageSummary;
  onClose: () => void;
  threadId?: string | undefined;
  crewBinding?: ThreadCrewBinding | undefined;
}) {
  const { t } = useLingui();
  // The percentage rolls in place as the thread streams. `%` stays outside the
  // animated element so locales that lead with the sign (Turkish) can move it.
  const countLabel =
    summary.percent === undefined ? (
      t`Usage unknown`
    ) : (
      <Trans>
        <AnimatedNumber value={summary.percent} />% Full
      </Trans>
    );
  return (
    <ThreadDockSection ariaLabel={t`Thread context usage`} placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Gauge}
        title={t`Usage`}
        countLabel={countLabel}
        actions={
          <ThreadDockIconButton label={t`Close usage details`} danger onPress={onClose}>
            <X className="size-3.5" />
          </ThreadDockIconButton>
        }
      />
      <ThreadContextUsageDetails summary={summary} />
      {threadId ? (
        <ThreadSpendDetails
          threadId={threadId}
          crewBinding={crewBinding}
          refreshKey={summary.usedTokens ?? 0}
        />
      ) : null}
    </ThreadDockSection>
  );
}

export function ThreadContextUsageDetails({ summary }: { summary: ThreadContextUsageSummary }) {
  const usageStyle = {
    "--lc-context-progress": `${summary.percent ?? 0}%`,
  } as CSSProperties;
  const tone = resolveContextUsageTone(summary);
  const fillClassName =
    tone === "danger"
      ? "poracode-context-dock__bar-fill poracode-context-dock__bar-fill--danger"
      : tone === "warning"
        ? "poracode-context-dock__bar-fill poracode-context-dock__bar-fill--warning"
        : "poracode-context-dock__bar-fill";
  const percentClassName =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <ThreadDockBody className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5 tabular-nums">
          <span className="font-medium text-foreground">
            <Trans>{summary.usedLabel} used</Trans>
          </span>
          <span aria-hidden="true" className="text-muted/60">
            ·
          </span>
          <span className="text-muted">
            <Trans>{summary.maxLabel} limit</Trans>
          </span>
        </span>
        {summary.percent !== undefined ? (
          <span className={`shrink-0 font-medium tabular-nums ${percentClassName}`}>
            {summary.percent}%
          </span>
        ) : null}
      </div>
      <div className="poracode-context-dock__bar" style={usageStyle} aria-hidden="true">
        <div className={fillClassName} />
      </div>
      {summary.breakdown.length > 0 ? (
        <ul className="divide-y divide-[var(--hairline-soft)]">
          {summary.breakdown.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-4 py-1 text-xs first:pt-0 last:pb-0"
            >
              <span className="min-w-0 truncate text-muted">{entry.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {entry.tokens.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          <Trans>Provider has not reported token usage.</Trans>
        </p>
      )}
    </ThreadDockBody>
  );
}

function resolveContextUsageTone(
  summary: ThreadContextUsageSummary,
): "default" | "warning" | "danger" {
  const percent = summary.percent;
  const used = summary.usedTokens;
  if (percent !== undefined && percent >= 90) return "danger";
  if ((percent !== undefined && percent >= 60) || (used !== undefined && used >= 300_000)) {
    return "warning";
  }
  return "default";
}
