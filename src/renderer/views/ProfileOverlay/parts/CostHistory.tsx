import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useState } from "react";
import { Disclosure, Skeleton } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import { Select } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { formatCost } from "../format";
import { CostTrend } from "./CostTrend";

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
        <div className="flex min-w-0 flex-col gap-4 @min-[640px]:justify-between @min-[640px]:border-r @min-[640px]:border-[var(--hairline-soft)] @min-[640px]:pr-6">
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
}: {
  stats: ProfileCostStats | undefined;
  loading: boolean;
  locale: string;
}) {
  const { t } = useLingui();
  const [breakdown, setBreakdown] = useState<"models" | "days" | "providers" | "accounts">(
    "models",
  );
  const [basis, setBasis] = useState<"estimate" | "reported" | null>(null);
  const [reportedCurrency, setReportedCurrency] = useState<string | null>(null);
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
  const currency = activeBasis === "estimate" ? "USD" : activeBasis;
  const displayCurrency =
    activeBasis === "estimate" ? "USD" : currencies.length > 0 ? activeBasis : undefined;
  const basisLabel =
    activeBasis === "estimate" ? t`API-equivalent estimate` : t`Provider-reported cost`;
  const basisCaption = displayCurrency ? `${basisLabel} · ${displayCurrency}` : basisLabel;
  const moneyHeading =
    (activeBasis === "estimate" ? t`API equivalent` : t`Provider reported`) +
    (displayCurrency ? ` · ${displayCurrency}` : "");
  const amount = (value: ProfileCostTotals) =>
    activeBasis === "estimate"
      ? value.estimatedSamples > 0
        ? value.estimatedUsd
        : undefined
      : value.observed.find((entry) => entry.currency === activeBasis)?.amount;
  const coverage = (value: ProfileCostTotals) =>
    activeBasis === "estimate" ? value.estimatedTokens : value.observedTokens;
  const isPartial = (value: ProfileCostTotals) =>
    coverage(value) < value.tokens || (activeBasis !== "estimate" && value.observed.length > 1);
  const costValue = (value: ProfileCostTotals) => {
    const known = amount(value);
    return known !== undefined
      ? formatCost(known, currency, locale) + (isPartial(value) ? ` · ${partial}` : "")
      : unknown;
  };
  const totalAmount = amount(totals);
  const byCost = (
    a: ProfileCostStats["providers"][number],
    b: ProfileCostStats["providers"][number],
  ) => (amount(b.totals) ?? -1) - (amount(a.totals) ?? -1) || a.key.localeCompare(b.key);
  const sortedProviders = stats.providers
    .filter((entry) => activeBasis !== "estimate" || entry.totals.estimatedSamples > 0)
    .toSorted(byCost);
  const rows =
    breakdown === "days"
      ? stats.days
          .toReversed()
          .map(({ day, totals: dayTotals }) => ({ key: day, label: day, totals: dayTotals }))
      : breakdown === "providers"
        ? sortedProviders
        : stats[breakdown]
            .filter((entry) => activeBasis !== "estimate" || entry.totals.estimatedSamples > 0)
            .toSorted(byCost);
  const rowHeading =
    breakdown === "models"
      ? t`Models`
      : breakdown === "days"
        ? t`Daily costs`
        : breakdown === "accounts"
          ? t`Accounts`
          : t`Providers`;
  const points = stats.days.map(({ day, totals: dayTotals }) => ({
    day,
    amount: amount(dayTotals),
    label: `${day}: ${costValue(dayTotals)} · ${dayTotals.unpricedTokens.toLocaleString(locale)} ${t`Unpriced tokens`}`,
  }));

  return (
    <div className="@container flex min-w-0 flex-col gap-6" data-testid="profile-cost-history">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            <Trans>Costs</Trans>
          </h1>
          <p className="mt-1 text-xs text-muted">
            <Trans>Retained usage on this host only.</Trans>
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-end gap-3 @min-[480px]:w-auto">
          <Select
            label={t`Cost source`}
            options={[
              { id: "estimate", label: t`API equivalent` },
              { id: "reported", label: t`Provider reported` },
            ]}
            value={activeBasis === "estimate" ? "estimate" : "reported"}
            onChange={(value) => setBasis(value === "estimate" ? "estimate" : "reported")}
            className="min-w-0 flex-1 @min-[480px]:w-52 @min-[480px]:flex-none"
          />
          {activeBasis !== "estimate" && currencies.length > 1 && (
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
          className="flex min-w-0 flex-col gap-4 @min-[640px]:justify-between @min-[640px]:border-r @min-[640px]:border-[var(--hairline-soft)] @min-[640px]:pr-6"
          aria-label={t`Costs`}
        >
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
                {activeBasis !== "estimate" && currencies.length > 1
                  ? t`Coverage across reported currencies`
                  : t`Coverage`}
                : {coverage(totals).toLocaleString(locale)} / {totals.tokens.toLocaleString(locale)}{" "}
                {t`Tokens`}
              </span>
            </p>
          </div>
          <dl className="border-t border-[var(--hairline-soft)] pt-3 text-xs">
            <dt className="text-muted">
              {activeBasis === "estimate" ? (
                <>
                  {t`Provider-reported cost`}
                  {reported ? ` · ${selectedCurrency}` : ""}
                </>
              ) : (
                t`API-equivalent estimate`
              )}
            </dt>
            <dd className="mt-1 break-words font-medium tabular-nums">
              {activeBasis === "estimate"
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
        <section className="flex min-w-0 flex-col gap-4" aria-label={t`Cost trend`}>
          <div>
            <h2 className="text-sm font-semibold">
              <Trans>Cost trend</Trans>
            </h2>
            <p className="mt-1 text-[11px] text-muted">{basisCaption}</p>
          </div>
          <CostTrend points={points} currency={currency} locale={locale} />
        </section>
      </ContentSurface>
      <section className="flex flex-col gap-3" aria-label={t`Recorded token categories`}>
        <h2 className="text-sm font-semibold">
          <Trans>Recorded token categories</Trans>
        </h2>
        <dl className="grid grid-cols-2 gap-3 @min-[480px]:grid-cols-3 @min-[880px]:grid-cols-6">
          {[
            [t`Tokens`, totals.tokens],
            [t`Input`, totals.categorizedTokens > 0 ? totals.categories.input : undefined],
            [t`Cache read`, totals.categorizedTokens > 0 ? totals.categories.cacheRead : undefined],
            [
              t`Cache write`,
              totals.categorizedTokens > 0 ? totals.categories.cacheWrite : undefined,
            ],
            [t`Output`, totals.categorizedTokens > 0 ? totals.categories.output : undefined],
            [t`Unpriced tokens`, totals.unpricedTokens],
          ].map(([label, value]) => (
            <ContentSurface key={label} className="min-w-0 px-3 py-2.5">
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd
                className="mt-1 break-words text-lg font-semibold tabular-nums"
                title={typeof value === "number" ? value.toLocaleString(locale) : undefined}
              >
                {typeof value === "number" ? value.toLocaleString(locale) : unknown}
              </dd>
            </ContentSurface>
          ))}
        </dl>
        <p className="text-[11px] leading-relaxed text-muted">
          <Trans>
            Categories cover {totals.categorizedTokens.toLocaleString(locale)} of{" "}
            {totals.tokens.toLocaleString(locale)} retained tokens. Missing categories, prices and
            older history remain unknown.
          </Trans>
        </p>
        <p className="text-[11px] leading-relaxed text-muted">
          <Trans>
            Input, output and cache categories do not overlap. Reasoning is included in output.
          </Trans>
        </p>
      </section>
      <section className="flex min-w-0 flex-col gap-3" aria-label={t`Providers`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            <Trans>Providers</Trans>
          </h2>
          <p className="text-xs text-muted">{basisCaption}</p>
        </div>
        {sortedProviders.length ? (
          <ul className="grid gap-3 @min-[480px]:grid-cols-2 @min-[800px]:grid-cols-3">
            {sortedProviders.map((entry) => (
              <li key={entry.key} className="min-w-0 content-surface p-3">
                <div className="flex items-start gap-2 text-sm">
                  <span aria-hidden>
                    <ProviderIcon
                      kind={entry.key}
                      fallbackLabel={entry.label}
                      className="size-4 shrink-0"
                    />
                  </span>
                  <span className="min-w-0 break-words font-medium">{entry.label || unknown}</span>
                </div>
                <p className="mt-2 break-words font-semibold tabular-nums">
                  {costValue(entry.totals)}
                </p>
                <p className="mt-1 text-xs text-muted tabular-nums">
                  {entry.totals.tokens.toLocaleString(locale)} {t`Tokens`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">
            {activeBasis === "estimate" ? t`No priced usage in this range.` : t`No data yet.`}
          </p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-3" aria-label={t`Cost breakdown`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            <Trans>Cost breakdown</Trans>
          </h2>
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
          className="max-h-[480px] overflow-y-auto px-3 outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
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
              {rows.map((entry) => (
                <tr
                  key={entry.key}
                  className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--hairline-soft)] py-3 last:border-0 @min-[640px]:table-row @min-[640px]:py-0"
                >
                  <th
                    scope="row"
                    className="col-span-2 min-w-0 break-words font-medium @min-[640px]:max-w-80 @min-[640px]:py-3 @min-[640px]:pr-5"
                  >
                    {entry.label || unknown}
                  </th>
                  <td className="min-w-0 break-words font-mono tabular-nums @min-[640px]:px-3 @min-[640px]:py-3 @min-[640px]:text-right">
                    <span
                      aria-hidden
                      className="mb-1 block font-sans text-[10px] text-muted @min-[640px]:hidden"
                    >
                      {moneyHeading}
                    </span>
                    {costValue(entry.totals)}
                  </td>
                  <td
                    className="min-w-0 break-words text-right tabular-nums @min-[640px]:px-3 @min-[640px]:py-3"
                    title={entry.totals.tokens.toLocaleString(locale)}
                  >
                    <span
                      aria-hidden
                      className="mb-1 block text-[10px] text-muted @min-[640px]:hidden"
                    >
                      {t`Tokens`}
                    </span>
                    {entry.totals.tokens.toLocaleString(locale)}
                  </td>
                  <td
                    className={`${entry.totals.unpricedTokens === 0 ? "sr-only @min-[640px]:not-sr-only" : "block"} col-span-2 text-muted tabular-nums @min-[640px]:table-cell @min-[640px]:py-3 @min-[640px]:pl-3 @min-[640px]:text-right`}
                  >
                    <span aria-hidden className="mr-1 @min-[640px]:hidden">
                      {t`Unpriced tokens`}:
                    </span>
                    {entry.totals.unpricedTokens.toLocaleString(locale)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    {activeBasis === "estimate"
                      ? t`No priced usage in this range.`
                      : t`No data yet.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ContentSurface>
        <p className="text-[11px] leading-relaxed text-muted">
          <Trans>Unpriced tokens have neither a provider-reported cost nor an API estimate.</Trans>
        </p>
      </section>
      <div className="flex flex-col gap-2 border-t border-[var(--hairline-soft)] pt-4 text-[11px] leading-relaxed text-muted">
        <dl className="flex flex-wrap gap-x-2 font-medium text-foreground">
          <dt>
            <Trans>Subscription bill</Trans>
          </dt>
          <dd>{unknown}</dd>
        </dl>
        <p>
          <Trans>
            Estimates and provider-reported costs are separate views of usage; do not add them
            together. Subscription invoices are not collected.
          </Trans>
        </p>
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
    </div>
  );
}
