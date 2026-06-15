import type { ProfileHeatmap } from "@/shared/contracts";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { ActivityHeatmap } from "./ActivityHeatmap";

export type ActivityMetric = "prompts" | "tokens";

export function ActivitySection(props: {
  promptHeatmap: ProfileHeatmap;
  tokenHeatmap: ProfileHeatmap | null;
  tokensAvailable: boolean;
  metric: ActivityMetric;
  onMetricChange: (metric: ActivityMetric) => void;
}) {
  const { promptHeatmap, tokenHeatmap, tokensAvailable, metric, onMetricChange } = props;
  const showTokens = metric === "tokens" && tokensAvailable && tokenHeatmap;
  const heatmap = showTokens ? tokenHeatmap : promptHeatmap;

  const tabs: ReadonlyArray<LightballTab<ActivityMetric>> = [
    { id: "prompts", label: "Prompts" },
    { id: "tokens", label: "Tokens", disabled: !tokensAvailable },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Activity</h2>
        <LightballTabs
          tabs={tabs}
          active={metric}
          onChange={onMetricChange}
          ariaLabel="Activity metric"
          className="w-[150px]"
          equalWidth
          shape="rounded"
        />
      </div>
      <ActivityHeatmap heatmap={heatmap} />
    </section>
  );
}
