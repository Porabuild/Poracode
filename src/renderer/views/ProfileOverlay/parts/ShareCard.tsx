import { forwardRef } from "react";
import type { ProfileCoreStats, ProfileTokenStats } from "@/shared/contracts";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { formatCompact, formatDays, initialsFor } from "../format";
import { ActivityHeatmap } from "./ActivityHeatmap";
import type { ActivityMetric } from "./ActivitySection";

function Stat(props: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-lg font-semibold tabular-nums text-foreground">{props.value}</div>
      <div className="text-[11px] text-muted">{props.label}</div>
    </div>
  );
}

/**
 * A fixed-width, opaque, screenshot-ready summary card. Captured to a PNG by the
 * main process (webContents.capturePage) so it can be pasted into social posts.
 */
export const ShareCard = forwardRef<
  HTMLDivElement,
  {
    core: ProfileCoreStats;
    tokens: ProfileTokenStats | null;
    metric: ActivityMetric;
  }
>(function ShareCard({ core, tokens, metric }, ref) {
  const { identity, totals, insights, promptHeatmap } = core;
  const provider = insights.topProvider;
  const lifetime = tokens?.available ? formatCompact(tokens.lifetimeTokens) : "-";
  const peak = tokens?.available ? formatCompact(tokens.peakDayTokens) : "-";
  // Mirror the metric selected on the profile page.
  const heatmap = metric === "tokens" && tokens?.available ? tokens.tokenHeatmap : promptHeatmap;

  return (
    <div
      ref={ref}
      className="flex w-[600px] flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ backgroundColor: identity.avatarColor }}
        >
          {initialsFor(identity.name)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-semibold leading-tight text-foreground">
            {identity.name}
          </span>
          <span className="truncate text-sm text-muted">@{identity.handle}</span>
        </div>
        {provider ? (
          <div className="flex shrink-0 items-center gap-2">
            <ProviderIcon
              kind={provider.key}
              fallbackLabel={provider.label}
              className="size-5 rounded-md"
            />
            <span className="text-sm font-medium text-foreground">{provider.label}</span>
          </div>
        ) : null}
      </div>

      <ActivityHeatmap heatmap={heatmap} />

      <div className="grid grid-cols-4 gap-2 border-t border-separator pt-4">
        <Stat value={lifetime} label="lifetime tokens" />
        <Stat value={peak} label="peak day" />
        <Stat value={formatDays(totals.currentStreakDays)} label="current streak" />
        <Stat value={formatDays(totals.longestStreakDays)} label="longest streak" />
      </div>

      <div className="flex items-center justify-center pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted/60">
        Lightcode
      </div>
    </div>
  );
});
