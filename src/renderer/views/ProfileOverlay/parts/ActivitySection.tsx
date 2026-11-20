import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileHeatmap, ProfileStatsWindow } from "@/shared/contracts";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { ActivityHeatmap } from "./ActivityHeatmap";

export type ActivityMetric = "prompts" | "tokens";

function HeatmapSkeleton(props: { window: ProfileStatsWindow }) {
  if (props.window === "7d" || props.window === "30d") {
    const count = props.window === "7d" ? 7 : 30;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-end gap-[3px]">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="size-3 rounded-[2px] bg-foreground/10" />
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <Skeleton className="h-2.5 w-24 rounded bg-foreground/10" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-6 rounded bg-foreground/10" />
        ))}
      </div>
      <Skeleton className="h-[88px] w-full rounded-lg bg-foreground/10 sm:h-[96px]" />
      <div className="flex items-center justify-end pt-1">
        <Skeleton className="h-2.5 w-24 rounded bg-foreground/10" />
      </div>
    </div>
  );
}

export function ActivitySection(props: {
  promptHeatmap: ProfileHeatmap | null;
  tokenHeatmap: ProfileHeatmap | null;
  tokensAvailable: boolean;
  loading?: boolean;
  window?: ProfileStatsWindow;
  metric: ActivityMetric;
  onMetricChange: (metric: ActivityMetric) => void;
}) {
  const { t } = useLingui();
  const {
    promptHeatmap,
    tokenHeatmap,
    tokensAvailable,
    loading = false,
    window = "all",
    metric,
    onMetricChange,
  } = props;
  const showTokens = metric === "tokens" && tokensAvailable && tokenHeatmap;
  const heatmap = showTokens ? tokenHeatmap : promptHeatmap;

  const tabs: ReadonlyArray<LightballTab<ActivityMetric>> = [
    { id: "prompts", label: t`Prompts` },
    { id: "tokens", label: t`Tokens`, disabled: !tokensAvailable },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t`Activity`}</h2>
        <LightballTabs
          tabs={tabs}
          active={metric}
          onChange={onMetricChange}
          ariaLabel={t`Activity metric`}
          className="w-[150px]"
          equalWidth
          shape="rounded"
        />
      </div>
      {loading || !heatmap ? (
        <HeatmapSkeleton window={window} />
      ) : (
        <ActivityHeatmap heatmap={heatmap} />
      )}
    </section>
  );
}
