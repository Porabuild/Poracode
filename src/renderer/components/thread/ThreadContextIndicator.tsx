import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

export function ThreadContextIndicator({
  summary,
  isOpen,
  onToggle,
}: {
  summary: ThreadContextUsageSummary;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const label = `${summary.headline}: ${summary.detail}`;
  const tone = resolveContextTone(summary.percent);
  const percent = summary.percent;
  const ringRadius = 6;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress =
    percent === undefined ? 0 : Math.max(0, Math.min(1, percent / 100)) * ringCircumference;

  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={isOpen ? t`Hide context usage details` : t`Show context usage details`}
          aria-pressed={isOpen}
          className={`poracode-context-indicator ${isOpen ? "poracode-context-indicator--open" : ""}`}
          data-tone={tone}
          onClick={onToggle}
        >
          <svg className="poracode-context-indicator__ring" viewBox="0 0 16 16" aria-hidden="true">
            <circle
              className="poracode-context-indicator__ring-track"
              cx="8"
              cy="8"
              r={ringRadius}
              fill="none"
              strokeWidth="1.5"
            />
            {percent !== undefined ? (
              <circle
                className="poracode-context-indicator__ring-progress"
                cx="8"
                cy="8"
                r={ringRadius}
                fill="none"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={`${ringProgress} ${ringCircumference}`}
                transform="rotate(-90 8 8)"
              />
            ) : null}
          </svg>
          <span className="sr-only">{label}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" className="px-2 py-1 text-xs">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-semibold text-foreground">{summary.headline}</span>
          {summary.usedTokens !== undefined || summary.maxTokens !== undefined ? (
            <>
              <span className="text-foreground-muted">·</span>
              <span className="text-foreground-muted">
                <span className="font-medium text-foreground">{summary.usedLabel}</span>
                {" / "}
                <span className="font-medium text-foreground">{summary.maxLabel}</span>
              </span>
            </>
          ) : null}
          <span className="sr-only">{label}</span>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

function resolveContextTone(
  percent: number | undefined,
): "unknown" | "normal" | "warning" | "danger" {
  if (percent === undefined) return "unknown";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "normal";
}
