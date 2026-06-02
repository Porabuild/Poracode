import { formatResetCountdown, type UsageWindow } from "@lightcode/agents-usage";
import { formatCodexFamilyModelLabel } from "@/renderer/components/common/ProviderModelMenu/parts/modelShortcutLabel";
import { formatWindowSecondaryValue, formatWindowValue } from "./usageFormat";
import { usageToneColor } from "./usageTone";

const SHORT_WINDOW_LABEL: Record<string, string> = {
  "session-5h": "Session (5h)",
  weekly: "Weekly",
  "weekly-opus": "Weekly · Opus",
  "weekly-sonnet": "Weekly · Sonnet",
  monthly: "Monthly",
  "extra-usage": "Extra usage",
  "cursor-auto": "Auto + Composer",
  "cursor-api": "API",
};

function codexUsageModelId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatUsageWindowLabel(window: UsageWindow): string {
  if (window.unit === "usd" && window.limit !== undefined) return window.label;
  if (window.id === "monthly" && window.unit === "requests") return window.label;
  if (window.id === "monthly" && window.label !== "Monthly") return window.label;
  const fixedLabel = SHORT_WINDOW_LABEL[window.id];
  if (fixedLabel) return fixedLabel;
  if (!window.id.startsWith("codex:")) return window.label;

  const period = window.id.endsWith(":session-5h")
    ? " (5h)"
    : window.id.endsWith(":weekly")
      ? " Weekly"
      : "";
  const baseLabel = window.label.replace(/\s+(?:Weekly|\(5h\))$/iu, "");
  return `${formatCodexFamilyModelLabel(codexUsageModelId(baseLabel)) ?? baseLabel}${period}`;
}

/** Labeled horizontal bars for a provider's usage windows, colored by tone. */
export function UsageWindowBars(props: {
  windows: readonly UsageWindow[];
  className?: string;
  showReset?: boolean;
}) {
  const { windows, className, showReset = true } = props;
  const now = Date.now();
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {windows.map((w) => {
        const pct = Math.max(0, Math.min(100, w.usedPercent));
        const reset =
          showReset && w.resetsAt !== undefined ? formatResetCountdown(w.resetsAt, now) : undefined;
        const secondary = formatWindowSecondaryValue(w);
        return (
          <div key={w.id}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">{formatUsageWindowLabel(w)}</span>
              <span className="tabular-nums text-foreground">
                {reset || secondary ? (
                  <span className="text-[11px] text-muted">
                    {[secondary, reset].filter(Boolean).join(" · ")} ·{" "}
                  </span>
                ) : null}
                {formatWindowValue(w)}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--separator)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: usageToneColor(w.usedPercent) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
