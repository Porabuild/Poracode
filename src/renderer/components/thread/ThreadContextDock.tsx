import { Tooltip } from "@heroui/react";
import { Gauge, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

export function ThreadContextDock({
  summary,
  onClose,
}: {
  summary: ThreadContextUsageSummary;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const usageStyle = {
    "--lc-context-progress": `${summary.percent ?? 0}%`,
  } as CSSProperties;
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
  const tone = resolveContextUsageTone(summary);
  const fillClassName =
    tone === "danger"
      ? "poracode-context-dock__bar-fill poracode-context-dock__bar-fill--danger"
      : tone === "warning"
        ? "poracode-context-dock__bar-fill poracode-context-dock__bar-fill--warning"
        : "poracode-context-dock__bar-fill";

  return (
    <ThreadDockSection ariaLabel={t`Thread context usage`} placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Gauge}
        title={t`Usage`}
        countLabel={countLabel}
        actions={
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <button
                aria-label={t`Close usage details`}
                className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                type="button"
                onClick={onClose}
              >
                <X className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Close usage details</Trans>
            </Tooltip.Content>
          </Tooltip>
        }
      />
      <div className="flex flex-col gap-2 px-3 pb-2">
        <div className="flex items-center justify-between gap-3 text-xs text-foreground-muted">
          <span>
            <Trans>{summary.usedLabel} used</Trans>
          </span>
          <span>
            <Trans>{summary.maxLabel} limit</Trans>
          </span>
        </div>
        <div className="poracode-context-dock__bar" style={usageStyle} aria-hidden="true">
          <div className={fillClassName} />
        </div>
        {summary.breakdown.length > 0 ? (
          <ul className="grid gap-1">
            {summary.breakdown.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 rounded px-1 py-0.5 text-xs"
              >
                <span className="min-w-0 truncate text-foreground">{entry.label}</span>
                <span className="shrink-0 tabular-nums text-foreground-muted">
                  {entry.tokens.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-foreground-muted">
            <Trans>Provider has not reported token usage.</Trans>
          </p>
        )}
      </div>
    </ThreadDockSection>
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
