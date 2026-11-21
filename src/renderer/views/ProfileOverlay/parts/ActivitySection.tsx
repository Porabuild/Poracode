import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileStatsWindow, ProfileTokenStats } from "@/shared/contracts";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { formatCompact, formatDayLabel } from "../format";
import { ActivityHeatmap } from "./ActivityHeatmap";

export type ActivityMetric = "prompts" | "tokens";

function HeroValueSkeleton() {
  return <Skeleton className="h-9 w-28 rounded-lg bg-foreground/10 @min-[880px]:h-10" />;
}

function SecondaryValueSkeleton() {
  return <Skeleton className="h-4 w-16 rounded bg-foreground/10" />;
}

function HeatmapSkeleton(props: { window: ProfileStatsWindow }) {
  if (props.window === "7d" || props.window === "30d") {
    const count = props.window === "7d" ? 7 : 30;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-end gap-[3px]">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton
              key={i}
              className="aspect-square min-w-0 max-w-3 flex-1 rounded-[2px] bg-foreground/10"
            />
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
      <Skeleton className="h-[88px] w-full rounded-lg bg-foreground/10 @min-[640px]:h-[96px]" />
      <div className="flex items-center justify-end pt-1">
        <Skeleton className="h-2.5 w-24 rounded bg-foreground/10" />
      </div>
    </div>
  );
}

export function ActivitySection(props: {
  core: ProfileCoreStats | null;
  coreLoading?: boolean;
  tokens: ProfileTokenStats | null;
  tokensLoading: boolean;
  window?: ProfileStatsWindow;
  metric: ActivityMetric;
  defaultToTokensWhileLoading?: boolean;
  onMetricChange: (metric: ActivityMetric) => void;
  peakAvailable?: boolean;
}) {
  const { t } = useLingui();
  const {
    core,
    coreLoading = false,
    tokens,
    tokensLoading,
    window = "all",
    metric,
    defaultToTokensWhileLoading = true,
    onMetricChange,
    peakAvailable = true,
  } = props;
  const totals = core?.totals;
  const corePending = coreLoading && !totals;
  const tokensPending = tokensLoading && !tokens;
  const tokensAvailable = Boolean(tokens?.available);
  const showTokens = metric === "tokens" && tokensAvailable && Boolean(tokens?.tokenHeatmap);
  const heatmap = showTokens ? (tokens?.tokenHeatmap ?? null) : (core?.promptHeatmap ?? null);

  const tokenLabel = window === "all" ? t`Lifetime tokens` : t`Total tokens`;
  const primaryIsTokens = metric === "tokens" || (defaultToTokensWhileLoading && tokensPending);

  const primaryLabel = primaryIsTokens ? tokenLabel : t`Total prompts`;
  const primaryValue = primaryIsTokens ? (
    tokensPending ? (
      <HeroValueSkeleton />
    ) : tokensAvailable ? (
      formatCompact(tokens!.lifetimeTokens)
    ) : (
      "-"
    )
  ) : corePending || !totals ? (
    <HeroValueSkeleton />
  ) : (
    totals.totalPrompts.toLocaleString()
  );

  const primarySub = primaryIsTokens
    ? tokens?.peakDay && peakAvailable
      ? `${t`Peak day`}: ${formatCompact(tokens.peakDayTokens)} · ${formatDayLabel(tokens.peakDay)}`
      : totals
        ? `${t`Total threads`}: ${totals.totalThreads.toLocaleString()}`
        : null
    : totals
      ? `${t`Total threads`}: ${totals.totalThreads.toLocaleString()}`
      : null;

  const secondaryLabel = primaryIsTokens ? t`Total prompts` : tokenLabel;
  const secondaryValue = primaryIsTokens ? (
    corePending || !totals ? (
      <SecondaryValueSkeleton />
    ) : (
      totals.totalPrompts.toLocaleString()
    )
  ) : tokensPending ? (
    <SecondaryValueSkeleton />
  ) : tokensAvailable ? (
    formatCompact(tokens!.lifetimeTokens)
  ) : (
    "-"
  );

  const tabs: ReadonlyArray<LightballTab<ActivityMetric>> = [
    { id: "prompts", label: t`Prompts` },
    { id: "tokens", label: t`Tokens`, disabled: !tokensAvailable },
  ];

  return (
    <ContentSurface className="grid gap-6 p-4 @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @min-[640px]:p-5">
      <section
        className="flex min-w-0 flex-col gap-4 border-b border-[var(--hairline-soft)] pb-5 @min-[640px]:justify-between @min-[640px]:border-r @min-[640px]:border-b-0 @min-[640px]:pr-6 @min-[640px]:pb-0"
        aria-label={primaryLabel}
      >
        <div>
          <h2 className="text-xs text-muted">{primaryLabel}</h2>
          <div className="mt-1 break-words text-3xl leading-tight font-semibold tracking-tight tabular-nums text-foreground @min-[880px]:text-4xl">
            {primaryValue}
          </div>
          {primarySub ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{primarySub}</p>
          ) : corePending && tokensPending ? (
            <Skeleton className="mt-2.5 h-3 w-36 rounded bg-foreground/10" />
          ) : null}
        </div>
        <dl className="border-t border-[var(--hairline-soft)] pt-3 text-xs">
          <dt className="text-muted">{secondaryLabel}</dt>
          <dd className="mt-1 break-words font-medium tabular-nums text-foreground">
            {secondaryValue}
          </dd>
        </dl>
      </section>
      <section className="flex min-w-0 flex-col justify-between gap-4" aria-label={t`Activity`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t`Activity`}</h2>
            <p className="mt-0.5 text-[11px] text-muted">{showTokens ? t`Tokens` : t`Prompts`}</p>
          </div>
          <LightballTabs
            tabs={tabs}
            active={metric}
            onChange={onMetricChange}
            ariaLabel={t`Activity metric`}
            className="w-[150px]"
            equalWidth
            shape="rounded"
            delayActiveText
          />
        </div>
        {corePending || !heatmap ? (
          <HeatmapSkeleton window={window} />
        ) : (
          <ActivityHeatmap heatmap={heatmap} />
        )}
      </section>
    </ContentSurface>
  );
}
