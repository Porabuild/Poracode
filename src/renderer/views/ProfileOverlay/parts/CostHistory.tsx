import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useState, type ReactNode } from "react";
import { Disclosure, Skeleton, Tooltip } from "@heroui/react";
import { Info } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import { Button, LightballTabs, Select, type LightballTab } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { formatCompact, formatCost } from "../format";
import {
  cacheHitRate,
  costTypeSegments,
  formatPercentShare,
  providerColor,
  providerKeyFromModelKey,
  tokenTypeSegments,
} from "./costBreakdown";
import { CostModelDialog } from "./CostModelDialog";
import { CostTypeShareSection } from "./CostShareBar";
import { CostTrend, type CostTrendPoint, type CostTrendSeries } from "./CostTrend";

function CostInfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip delay={250} isOpen={open} onOpenChange={setOpen} shouldCloseOnPress={false}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        aria-expanded={open}
        className="size-6 min-h-6 min-w-6 text-muted"
        onPress={() => setOpen((prev) => !prev)}
      >
        <Info className="size-3.5" aria-hidden />
      </Button>
      <Tooltip.Content placement="top" className="max-w-72 space-y-1.5 text-xs leading-relaxed">
        {children}
      </Tooltip.Content>
    </Tooltip>
  );
}

function CostHistorySkeleton() {
  return (
    <div className="@container flex min-w-0 flex-col gap-6" data-testid="profile-cost-skeleton">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-20 rounded-md bg-foreground/10" />
          <Skeleton className="h-3.5 w-44 rounded bg-foreground/10" />
        </div>
        <Skeleton className="h-9 w-full rounded-xl bg-foreground/10 @min-[480px]:w-52" />
      </div>
      <ContentSurface className="grid gap-6 p-4 @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @min-[640px]:p-5">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[var(--hairline-soft)] pb-5 @min-[640px]:justify-between @min-[640px]:border-r @min-[640px]:border-b-0 @min-[640px]:pr-6 @min-[640px]:pb-0">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-32 rounded bg-foreground/10" />
            <Skeleton className="h-10 w-36 rounded-lg bg-foreground/10" />
            <Skeleton className="h-3 w-40 rounded bg-foreground/10" />
          </div>
          <div className="space-y-2 border-t border-[var(--hairline-soft)] pt-3">
            <Skeleton className="h-3 w-28 rounded bg-foreground/10" />
            <Skeleton className="h-4 w-20 rounded bg-foreground/10" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24 rounded bg-foreground/10" />
            <Skeleton className="h-3 w-40 rounded bg-foreground/10" />
          </div>
          <Skeleton className="h-40 w-full rounded-lg bg-foreground/10 @min-[480px]:h-48" />
        </div>
      </ContentSurface>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-44 rounded bg-foreground/10" />
        <div className="grid grid-cols-2 gap-3 @min-[480px]:grid-cols-3 @min-[880px]:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ContentSurface key={i} className="px-3 py-2.5">
              <Skeleton className="h-3 w-16 rounded bg-foreground/10" />
              <Skeleton className="mt-2 h-6 w-20 rounded bg-foreground/10" />
            </ContentSurface>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded bg-foreground/10" />
        <div className="grid gap-3 @min-[480px]:grid-cols-2 @min-[800px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ContentSurface key={i} className="p-3">
              <Skeleton className="h-4 w-24 rounded bg-foreground/10" />
              <Skeleton className="mt-3 h-5 w-20 rounded bg-foreground/10" />
              <Skeleton className="mt-2 h-3 w-28 rounded bg-foreground/10" />
            </ContentSurface>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CostHistory({
  stats,
  loading,
  locale,
  allDevices = false,
}: {
  stats: ProfileCostStats | undefined;
  loading: boolean;
  locale: string;
  allDevices?: boolean;
}) {
  const { t } = useLingui();
  const [breakdown, setBreakdown] = useState<"models" | "days" | "providers" | "accounts">(
    "models",
  );
  const [basis, setBasis] = useState<"estimate" | "reported" | null>(null);
  const [reportedCurrency, setReportedCurrency] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<"cost" | "tokens">("cost");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);

  if (loading)
    return (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          <Trans>Loading</Trans>
        </span>
        <CostHistorySkeleton />
      </div>
    );
  if (!stats)
    return (
      <p className="text-sm text-muted">
        <Trans>Cost history is unavailable from this host.</Trans>
      </p>
    );

  const { totals } = stats;
  const unknown = t`Unknown`;
  const partial = t`Partial`;
  const currencies = [...new Set(totals.observed.map((entry) => entry.currency))].sort();
  const selectedCurrency =
    reportedCurrency !== null && currencies.includes(reportedCurrency)
      ? reportedCurrency
      : (currencies[0] ?? "USD");
  const reported = totals.observed.find((entry) => entry.currency === selectedCurrency);
  const activeBasis =
    (basis ??
      (totals.estimatedSamples > 0 || currencies.length === 0 ? "estimate" : "reported")) ===
    "estimate"
      ? "estimate"
      : selectedCurrency;
  const activeBasisIsEstimate = activeBasis === "estimate";
  const currency = activeBasisIsEstimate ? "USD" : activeBasis;
  const displayCurrency = activeBasisIsEstimate
    ? "USD"
    : currencies.length > 0
      ? activeBasis
      : undefined;
  const basisLabel = activeBasisIsEstimate ? t`API-equivalent estimate` : t`Provider-reported cost`;
  const basisCaption = displayCurrency ? `${basisLabel} · ${displayCurrency}` : basisLabel;
  const moneyHeading =
    (activeBasisIsEstimate ? t`API equivalent` : t`Provider reported`) +
    (displayCurrency ? ` · ${displayCurrency}` : "");
  const amount = (value: ProfileCostTotals) =>
    activeBasisIsEstimate
      ? value.estimatedSamples > 0
        ? value.estimatedUsd
        : undefined
      : value.observed.find((entry) => entry.currency === activeBasis)?.amount;
  const coverage = (value: ProfileCostTotals) =>
    activeBasisIsEstimate ? value.estimatedTokens : value.observedTokens;
  const isPartial = (value: ProfileCostTotals) =>
    coverage(value) < value.tokens || (!activeBasisIsEstimate && value.observed.length > 1);
  const costValue = (value: ProfileCostTotals) => {
    const known = amount(value);
    return known !== undefined
      ? formatCost(known, currency, locale) + (isPartial(value) ? ` · ${partial}` : "")
      : unknown;
  };
  const totalAmount = amount(totals);
  const effectiveChartMetric: "cost" | "tokens" = totals.tokens > 0 ? chartMetric : "cost";
  const byCost = (
    a: ProfileCostStats["providers"][number],
    b: ProfileCostStats["providers"][number],
  ) => (amount(b.totals) ?? -1) - (amount(a.totals) ?? -1) || a.key.localeCompare(b.key);
  const sortedProviders = stats.providers
    .filter((entry) => !activeBasisIsEstimate || entry.totals.estimatedSamples > 0)
    .toSorted(byCost);

  // Build multi-provider chart series whenever dayProviders has data.
  const providerByKey = new Map(stats.providers.map((p) => [p.key, p]));
  const dayProviderMap = new Map<string, Map<string, ProfileCostTotals>>();
  const attributedTokensByDay = new Map<string, number>();
  const activeProviderKeys = new Set<string>();
  if (stats.dayProviders && stats.dayProviders.length > 0) {
    for (const entry of stats.dayProviders) {
      let byProv = dayProviderMap.get(entry.day);
      if (!byProv) {
        byProv = new Map();
        dayProviderMap.set(entry.day, byProv);
      }
      byProv.set(entry.provider, entry.totals);
      attributedTokensByDay.set(
        entry.day,
        (attributedTokensByDay.get(entry.day) ?? 0) + entry.totals.tokens,
      );
      const val = effectiveChartMetric === "tokens" ? entry.totals.tokens : amount(entry.totals);
      if (val !== undefined && val > 0) activeProviderKeys.add(entry.provider);
    }
  }

  const chartSeries: CostTrendSeries[] =
    activeProviderKeys.size > 0
      ? [...activeProviderKeys]
          .map((key) => {
            const entry = providerByKey.get(key);
            const sortVal = entry
              ? effectiveChartMetric === "tokens"
                ? entry.totals.tokens
                : (amount(entry.totals) ?? 0)
              : 0;
            return { key, label: entry?.label || key, sortVal };
          })
          .sort((a, b) => b.sortVal - a.sortVal || a.key.localeCompare(b.key))
          .map(({ key, label }) => ({ key, label }))
      : [];

  const points: CostTrendPoint[] = stats.days.map(({ day, totals: dayTotals }) => {
    const dayByProv = dayProviderMap.get(day);
    let byProvider: Record<string, number | undefined> | undefined;
    if (chartSeries.length > 0) {
      byProvider = {};
      // When every token on a day is attributed to known providers, an absent
      // provider genuinely spent 0 that day; otherwise keep it unknown (`undefined`).
      const dayFullyAttributed =
        dayTotals.tokens === 0 || attributedTokensByDay.get(day) === dayTotals.tokens;
      for (const s of chartSeries) {
        const provTotals = dayByProv?.get(s.key);
        byProvider[s.key] = provTotals
          ? effectiveChartMetric === "tokens"
            ? provTotals.tokens
            : amount(provTotals)
          : dayFullyAttributed
            ? 0
            : undefined;
      }
    }
    const dayAmount = effectiveChartMetric === "tokens" ? dayTotals.tokens : amount(dayTotals);
    return {
      day,
      amount: dayAmount,
      label:
        effectiveChartMetric === "tokens"
          ? `${day}: ${dayTotals.tokens.toLocaleString(locale)} ${t`Tokens`}`
          : `${day}: ${costValue(dayTotals)} · ${dayTotals.unpricedTokens.toLocaleString(locale)} ${t`Unpriced tokens`}`,
      ...(byProvider ? { byProvider } : {}),
    };
  });

  const rows =
    breakdown === "days"
      ? stats.days
          .toReversed()
          .map(({ day, totals: dayTotals }) => ({ key: day, label: day, totals: dayTotals }))
      : breakdown === "providers"
        ? sortedProviders
        : stats[breakdown]
            .filter((entry) => !activeBasisIsEstimate || entry.totals.estimatedSamples > 0)
            .toSorted(byCost);

  const rowPeakAmount = rows.reduce((peak, entry) => Math.max(peak, amount(entry.totals) ?? 0), 0);
  const rowHeading =
    breakdown === "models"
      ? t`Models`
      : breakdown === "days"
        ? t`Daily costs`
        : breakdown === "accounts"
          ? t`Accounts`
          : t`Providers`;

  const costSegments = costTypeSegments(totals, totalAmount, activeBasisIsEstimate);
  const tokenSegments = tokenTypeSegments(totals);
  // Cache savings is an API-equivalent USD metric; only show it in estimate mode so
  // non-USD provider-reported views never mix in hardcoded USD figures.
  const cacheSavingsUsd =
    activeBasisIsEstimate && totals.cacheSavingsUsd !== undefined && totals.cacheSavingsUsd > 0
      ? totals.cacheSavingsUsd
      : undefined;

  const selectedModel =
    selectedModelKey !== null
      ? (stats.models.find((m) => m.key === selectedModelKey) ?? null)
      : null;

  const chartMetricTabs: ReadonlyArray<LightballTab<"cost" | "tokens">> = [
    { id: "cost", label: t`Cost` },
    { id: "tokens", label: t`Tokens` },
  ];

  const categoryTiles: Array<{ label: string; value: string; title?: string }> = [
    {
      label: t`Tokens`,
      value: totals.tokens.toLocaleString(locale),
      title: totals.tokens.toLocaleString(locale),
    },
    {
      label: t`Input`,
      value:
        totals.categorizedTokens > 0 ? totals.categories.input.toLocaleString(locale) : unknown,
      ...(totals.categorizedTokens > 0
        ? { title: totals.categories.input.toLocaleString(locale) }
        : {}),
    },
    {
      label: t`Cache read`,
      value:
        totals.categorizedTokens > 0 ? totals.categories.cacheRead.toLocaleString(locale) : unknown,
      ...(totals.categorizedTokens > 0
        ? { title: totals.categories.cacheRead.toLocaleString(locale) }
        : {}),
    },
    {
      label: t`Cache write`,
      value:
        totals.categorizedTokens > 0
          ? totals.categories.cacheWrite.toLocaleString(locale)
          : unknown,
      ...(totals.categorizedTokens > 0
        ? { title: totals.categories.cacheWrite.toLocaleString(locale) }
        : {}),
    },
    {
      label: t`Output`,
      value:
        totals.categorizedTokens > 0 ? totals.categories.output.toLocaleString(locale) : unknown,
      ...(totals.categorizedTokens > 0
        ? { title: totals.categories.output.toLocaleString(locale) }
        : {}),
    },
    {
      label: t`Unpriced tokens`,
      value: totals.unpricedTokens.toLocaleString(locale),
      title: totals.unpricedTokens.toLocaleString(locale),
    },
  ];

  return (
    <div className="@container flex min-w-0 flex-col gap-6" data-testid="profile-cost-history">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            <Trans>Costs</Trans>
          </h1>
          <p className="mt-1 text-xs text-muted">
            {allDevices ? (
              <Trans>Retained usage across connected devices.</Trans>
            ) : (
              <Trans>Retained usage on this host only.</Trans>
            )}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-end gap-3 @min-[480px]:w-auto">
          <Select
            label={t`Cost source`}
            options={[
              { id: "estimate", label: t`API equivalent` },
              { id: "reported", label: t`Provider reported` },
            ]}
            value={activeBasisIsEstimate ? "estimate" : "reported"}
            onChange={(value) => setBasis(value === "estimate" ? "estimate" : "reported")}
            className="min-w-0 flex-1 @min-[480px]:w-52 @min-[480px]:flex-none"
          />
          {!activeBasisIsEstimate && currencies.length > 1 && (
            <Select
              label={t`Currency`}
              options={currencies.map((code) => ({ id: code, label: code }))}
              value={activeBasis}
              onChange={setReportedCurrency}
              className="w-28 min-w-0"
            />
          )}
        </div>
      </div>

      <ContentSurface className="grid gap-6 p-4 @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @min-[640px]:p-5">
        <section
          className="flex min-w-0 flex-col gap-4 border-b border-[var(--hairline-soft)] pb-5 @min-[640px]:justify-between @min-[640px]:border-r @min-[640px]:border-b-0 @min-[640px]:pr-6 @min-[640px]:pb-0"
          aria-label={t`Costs`}
        >
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xs text-muted">{basisLabel}</h2>
              <div
                className="mt-1 break-words text-3xl leading-tight font-semibold tracking-tight tabular-nums text-foreground @min-[880px]:text-4xl"
                data-testid="profile-cost-total"
              >
                {totalAmount !== undefined ? formatCost(totalAmount, currency, locale) : unknown}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {displayCurrency}
                {totalAmount !== undefined && isPartial(totals) ? ` · ${partial}` : ""}
                <span className="block">
                  {!activeBasisIsEstimate && currencies.length > 1
                    ? t`Coverage across reported currencies`
                    : t`Coverage`}
                  : {coverage(totals).toLocaleString(locale)} /{" "}
                  {totals.tokens.toLocaleString(locale)} {t`Tokens`}
                </span>
              </p>
            </div>

            {sortedProviders.length > 1 && totalAmount !== undefined && totalAmount > 0 ? (
              <div className="flex flex-col gap-2.5 border-t border-[var(--hairline-soft)] pt-3">
                {sortedProviders.slice(0, 5).map((entry) => {
                  const provAmount = amount(entry.totals);
                  const share =
                    provAmount !== undefined && totalAmount > 0 ? provAmount / totalAmount : null;
                  return (
                    <div key={entry.key} className="flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: providerColor(entry.key) }}
                          />
                          <ProviderIcon
                            kind={entry.key}
                            fallbackLabel={entry.label}
                            className="size-3.5 shrink-0"
                          />
                          <span className="truncate">{entry.label || unknown}</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-foreground">
                          {provAmount !== undefined
                            ? formatCost(provAmount, currency, locale)
                            : unknown}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted tabular-nums">
                        {share !== null ? `${formatPercentShare(share)} · ` : ""}
                        {formatCompact(entry.totals.tokens)} {t`tokens`}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <dl className="border-t border-[var(--hairline-soft)] pt-3 text-xs">
            <dt className="text-muted">
              {activeBasisIsEstimate ? (
                <>
                  {t`Provider-reported cost`}
                  {reported ? ` · ${selectedCurrency}` : ""}
                </>
              ) : (
                t`API-equivalent estimate`
              )}
            </dt>
            <dd className="mt-1 break-words font-medium tabular-nums">
              {activeBasisIsEstimate
                ? reported
                  ? formatCost(reported.amount, selectedCurrency, locale) +
                    (totals.observedTokens < totals.tokens || currencies.length > 1
                      ? ` · ${partial}`
                      : "")
                  : unknown
                : totals.estimatedSamples > 0
                  ? formatCost(totals.estimatedUsd, "USD", locale) +
                    (totals.estimatedTokens < totals.tokens ? ` · ${partial}` : "")
                  : unknown}
            </dd>
          </dl>
        </section>

        <section className="flex min-w-0 flex-col justify-between gap-4" aria-label={t`Cost trend`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                <Trans>Cost trend</Trans>
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {effectiveChartMetric === "tokens" ? t`Tokens` : basisCaption}
              </p>
            </div>
            {totals.tokens > 0 ? (
              <LightballTabs
                tabs={chartMetricTabs}
                active={effectiveChartMetric}
                onChange={setChartMetric}
                ariaLabel={t`Trend metric`}
                className="w-[140px]"
                equalWidth
                shape="rounded"
                delayActiveText
              />
            ) : null}
          </div>
          <CostTrend
            points={points}
            series={chartSeries}
            metric={effectiveChartMetric}
            currency={currency}
            locale={locale}
          />
        </section>
      </ContentSurface>

      <section className="flex flex-col gap-3" aria-label={t`Recorded token categories`}>
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">
            <Trans>Recorded token categories</Trans>
          </h2>
          <CostInfoTooltip label={t`About recorded token categories`}>
            <p>
              <Trans>
                Categories cover {totals.categorizedTokens.toLocaleString(locale)} of{" "}
                {totals.tokens.toLocaleString(locale)} retained tokens. Missing categories, prices
                and older history remain unknown.
              </Trans>
            </p>
            <p>
              <Trans>
                Input, output and cache categories do not overlap. Reasoning is included in output.
              </Trans>
            </p>
          </CostInfoTooltip>
        </div>
        <dl className="grid grid-cols-2 gap-3 @min-[480px]:grid-cols-3 @min-[880px]:grid-cols-6">
          {categoryTiles.map(({ label, value, title }) => (
            <ContentSurface key={label} className="min-w-0 px-3 py-2.5">
              <dt className="truncate text-[11px] text-muted">{label}</dt>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums" title={title}>
                {value}
              </dd>
            </ContentSurface>
          ))}
        </dl>
      </section>

      <CostTypeShareSection
        costSegments={costSegments}
        tokenSegments={tokenSegments}
        currency={currency}
        locale={locale}
        className="@min-[640px]:p-5"
        {...(cacheSavingsUsd !== undefined
          ? {
              costAside: (
                <span className="text-xs text-muted" data-testid="profile-cost-cache-savings">
                  {t`Cache savings`}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCost(cacheSavingsUsd, "USD", locale)}
                  </span>
                </span>
              ),
            }
          : {})}
      />

      <section className="flex min-w-0 flex-col gap-3" aria-label={t`Providers`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            <Trans>Providers</Trans>
          </h2>
          <p className="text-xs text-muted">{basisCaption}</p>
        </div>
        {sortedProviders.length ? (
          <ul className="grid gap-3 @min-[480px]:grid-cols-2 @min-[800px]:grid-cols-3">
            {sortedProviders.map((entry) => {
              const provAmount = amount(entry.totals);
              const share =
                provAmount !== undefined && totalAmount && totalAmount > 0
                  ? provAmount / totalAmount
                  : null;
              const provHitRate = cacheHitRate(entry.totals);
              return (
                <li key={entry.key} className="min-w-0 content-surface p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: providerColor(entry.key) }}
                      />
                      <span aria-hidden="true">
                        <ProviderIcon
                          kind={entry.key}
                          fallbackLabel={entry.label}
                          className="size-4 shrink-0"
                        />
                      </span>
                      <span className="min-w-0 truncate font-medium">{entry.label || unknown}</span>
                    </div>
                    {share !== null ? (
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {formatPercentShare(share)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 break-words font-semibold tabular-nums">
                    {costValue(entry.totals)}
                  </p>
                  <p className="mt-1 text-xs text-muted tabular-nums">
                    {entry.totals.tokens.toLocaleString(locale)} {t`Tokens`}
                    {provHitRate !== null
                      ? ` · ${formatPercentShare(provHitRate)} ${t`cache`}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">
            {activeBasisIsEstimate ? t`No priced usage in this range.` : t`No data yet.`}
          </p>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3" aria-label={t`Cost breakdown`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold">
              <Trans>Cost breakdown</Trans>
            </h2>
            <CostInfoTooltip label={t`About cost breakdown`}>
              <p>
                <Trans>
                  Unpriced tokens have neither a provider-reported cost nor an API estimate.
                </Trans>
              </p>
            </CostInfoTooltip>
          </div>
          <Select
            options={[
              { id: "models", label: t`Models` },
              { id: "days", label: t`Daily costs` },
              { id: "accounts", label: t`Accounts` },
              { id: "providers", label: t`Providers` },
            ]}
            value={breakdown}
            onChange={(value) => setBreakdown(value as typeof breakdown)}
            aria-label={t`Cost breakdown`}
            className="w-full min-w-0 @min-[480px]:w-44"
          />
        </div>
        <ContentSurface
          role="region"
          aria-label={rowHeading}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard focus enables native scrolling
          tabIndex={0}
          className="max-h-[480px] overflow-y-auto px-3 outline-none focus-visible:focus-ring"
        >
          <table className="block w-full text-left text-xs @min-[640px]:table">
            <caption className="sr-only">
              {rowHeading} · {basisCaption}
            </caption>
            <thead className="sr-only text-muted @min-[640px]:not-sr-only @min-[640px]:table-header-group">
              <tr className="border-b border-[var(--hairline-soft)]">
                <th
                  scope="col"
                  className="bg-background/95 py-3 pr-5 font-medium backdrop-blur-xs @min-[640px]:sticky @min-[640px]:top-0 @min-[640px]:z-10"
                >
                  {rowHeading}
                </th>
                <th
                  scope="col"
                  className="bg-background/95 px-3 py-3 text-right font-medium backdrop-blur-xs @min-[640px]:sticky @min-[640px]:top-0 @min-[640px]:z-10"
                >
                  {moneyHeading}
                </th>
                <th
                  scope="col"
                  className="bg-background/95 px-3 py-3 text-right font-medium backdrop-blur-xs @min-[640px]:sticky @min-[640px]:top-0 @min-[640px]:z-10"
                >
                  <Trans>Tokens</Trans>
                </th>
                <th
                  scope="col"
                  className="bg-background/95 py-3 pl-3 text-right font-medium backdrop-blur-xs @min-[640px]:sticky @min-[640px]:top-0 @min-[640px]:z-10"
                >
                  <Trans>Unpriced tokens</Trans>
                </th>
              </tr>
            </thead>
            <tbody className="block @min-[640px]:table-row-group">
              {rows.map((entry) => {
                const entryAmount = amount(entry.totals);
                const isModelRow = breakdown === "models";
                const modelProvKey = isModelRow
                  ? providerKeyFromModelKey(entry.key)
                  : breakdown === "providers" || breakdown === "accounts"
                    ? entry.key
                    : undefined;
                const barWidth =
                  entryAmount !== undefined && entryAmount > 0 && rowPeakAmount > 0
                    ? Math.max(4, (entryAmount / rowPeakAmount) * 100)
                    : 0;
                const barColor = modelProvKey ? providerColor(modelProvKey) : "var(--foreground)";
                const share =
                  breakdown !== "days" &&
                  entryAmount !== undefined &&
                  totalAmount &&
                  totalAmount > 0
                    ? entryAmount / totalAmount
                    : null;
                return (
                  <tr
                    key={entry.key}
                    onClick={
                      isModelRow
                        ? () => {
                            if (window.getSelection()?.toString()) return;
                            setSelectedModelKey(entry.key);
                          }
                        : undefined
                    }
                    className={`grid grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--hairline-soft)] py-3 last:border-0 @min-[640px]:table-row @min-[640px]:py-0 ${
                      isModelRow
                        ? "cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
                        : ""
                    }`}
                  >
                    <th
                      scope="row"
                      className="col-span-2 min-w-0 break-words font-medium @min-[640px]:max-w-80 @min-[640px]:py-3 @min-[640px]:pr-5"
                    >
                      {isModelRow ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedModelKey(entry.key);
                          }}
                          className="flex w-full items-center gap-2 text-left text-foreground outline-none focus-visible:focus-ring"
                        >
                          {modelProvKey ? (
                            <ProviderIcon
                              kind={modelProvKey}
                              fallbackLabel={entry.label}
                              className="size-3.5 shrink-0"
                            />
                          ) : null}
                          <span className="min-w-0 truncate">{entry.label || unknown}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2">
                          {modelProvKey ? (
                            <ProviderIcon
                              kind={modelProvKey}
                              fallbackLabel={entry.label}
                              className="size-3.5 shrink-0"
                            />
                          ) : null}
                          <span className="min-w-0 truncate">{entry.label || unknown}</span>
                        </span>
                      )}
                      {barWidth > 0 && breakdown !== "days" ? (
                        <div
                          aria-hidden="true"
                          className="mt-1.5 h-0.5 max-w-48 overflow-hidden rounded-full bg-foreground/10"
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                          />
                        </div>
                      ) : null}
                    </th>
                    <td className="min-w-0 break-words font-mono tabular-nums @min-[640px]:px-3 @min-[640px]:py-3 @min-[640px]:text-right">
                      <span
                        aria-hidden="true"
                        className="mb-1 block font-sans text-[10px] text-muted @min-[640px]:hidden"
                      >
                        {moneyHeading}
                      </span>
                      {costValue(entry.totals)}
                      {share !== null ? (
                        <span className="ml-1.5 font-sans text-[10px] text-muted">
                          {formatPercentShare(share)}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="min-w-0 break-words text-right tabular-nums @min-[640px]:px-3 @min-[640px]:py-3"
                      title={entry.totals.tokens.toLocaleString(locale)}
                    >
                      <span
                        aria-hidden="true"
                        className="mb-1 block text-[10px] text-muted @min-[640px]:hidden"
                      >
                        {t`Tokens`}
                      </span>
                      {entry.totals.tokens.toLocaleString(locale)}
                    </td>
                    <td
                      className={`${entry.totals.unpricedTokens === 0 ? "sr-only @min-[640px]:not-sr-only" : "block"} col-span-2 text-muted tabular-nums @min-[640px]:table-cell @min-[640px]:py-3 @min-[640px]:pl-3 @min-[640px]:text-right`}
                    >
                      <span aria-hidden="true" className="mr-1 @min-[640px]:hidden">
                        {t`Unpriced tokens`}:
                      </span>
                      {entry.totals.unpricedTokens.toLocaleString(locale)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    {activeBasisIsEstimate ? t`No priced usage in this range.` : t`No data yet.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ContentSurface>
      </section>

      <div className="flex items-center gap-1.5 border-t border-[var(--hairline-soft)] pt-4 text-[11px] leading-relaxed text-muted">
        <dl className="flex flex-wrap gap-x-2 font-medium text-foreground">
          <dt>
            <Trans>Subscription bill</Trans>
          </dt>
          <dd>{unknown}</dd>
        </dl>
        <CostInfoTooltip label={t`About subscription bill`}>
          <p>
            <Trans>
              Estimates and provider-reported costs are separate views of usage; do not add them
              together. Subscription invoices are not collected.
            </Trans>
          </p>
        </CostInfoTooltip>
      </div>

      <Disclosure className="border-t border-[var(--hairline-soft)] pt-4">
        <Disclosure.Heading>
          <Disclosure.Trigger className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold">
            <Trans>Pricing provenance</Trans>
            <Disclosure.Indicator className="shrink-0 text-muted" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="flex flex-col gap-3 pt-3">
            <p className="text-xs leading-relaxed text-muted">
              <Trans>
                Estimates use saved, dated USD list rates for exact model IDs at standard API speed.
                They exclude subscriptions, negotiated discounts, speed premiums, tools and taxes.
                Prices are never applied to dates before their first verified snapshot.
              </Trans>
            </p>
            {stats.pricing.map((price) => (
              <div key={price.id} className="flex flex-col gap-1 text-xs">
                <a
                  href={price.source}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-foreground underline decoration-border underline-offset-2"
                >
                  {price.model} · {price.reviewedAt}
                </a>
                <span className="text-muted">
                  <Trans>USD per million tokens</Trans>: {t`Input`} {price.input} · {t`Output`}{" "}
                  {price.output} · {t`Cache read`} {price.cacheRead} · {t`Cache write`}{" "}
                  {price.cacheWrite > 0
                    ? `${price.cacheWrite} / ${price.cacheWrite1h} (5m / 1h)`
                    : unknown}
                </span>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted">
              <Trans>
                Imported sessions contribute only recorded usage. Deleted threads keep their ledger
                history. Account dashboard snapshots and external log estimates are not added,
                preventing overlapping totals across hosts or accounts.
              </Trans>
            </p>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>

      <CostModelDialog
        model={selectedModel}
        days={stats.days}
        {...(stats.dayModels ? { dayModels: stats.dayModels } : {})}
        totalCostAmount={totalAmount}
        activeBasisIsEstimate={activeBasisIsEstimate}
        currency={currency}
        locale={locale}
        amount={amount}
        coverage={coverage}
        costValue={costValue}
        onClose={() => setSelectedModelKey(null)}
      />
    </div>
  );
}
