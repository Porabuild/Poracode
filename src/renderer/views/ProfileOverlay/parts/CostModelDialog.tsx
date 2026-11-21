import { Modal } from "@heroui/react";
import { X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { Button } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { formatCompact, formatCost } from "../format";
import {
  cacheHitRate,
  costPerMillionTokens,
  costTypeSegments,
  formatPercentShare,
  providerKeyFromModelKey,
  tokenTypeSegments,
} from "./costBreakdown";
import { CostTypeShareSection } from "./CostShareBar";
import { CostTrend, type CostTrendPoint } from "./CostTrend";

export interface CostModelDialogProps {
  model: ProfileCostStats["models"][number] | null;
  days: ProfileCostStats["days"];
  dayModels?: ProfileCostStats["dayModels"];
  totalCostAmount: number | undefined;
  activeBasisIsEstimate: boolean;
  currency: string;
  locale: string;
  amount: (totals: ProfileCostTotals) => number | undefined;
  coverage: (totals: ProfileCostTotals) => number;
  costValue: (totals: ProfileCostTotals) => string;
  onClose: () => void;
}

/**
 * Per-model drill-down dialog (inspired by t3code's UsageModelDialog): shows
 * effective cost per 1M tokens, cache hit rate, daily trend, and cost/token
 * category share bars.
 */
export function CostModelDialog(props: CostModelDialogProps) {
  const { t } = useLingui();
  const {
    model,
    days,
    dayModels,
    totalCostAmount,
    activeBasisIsEstimate,
    currency,
    locale,
    amount,
    coverage,
    costValue,
    onClose,
  } = props;

  if (!model) return null;

  const providerKey = providerKeyFromModelKey(model.key);
  const modelAmount = amount(model.totals);
  const costUnknown = modelAmount === undefined;
  const pricedTokens = coverage(model.totals);
  const perMillion = costPerMillionTokens(modelAmount, pricedTokens);
  const hitRate = cacheHitRate(model.totals);
  const costShare =
    !costUnknown && totalCostAmount && totalCostAmount > 0 ? modelAmount / totalCostAmount : null;

  const byDay = new Map<string, ProfileCostTotals>();
  const attributedTokensByDay = new Map<string, number>();
  if (dayModels) {
    for (const entry of dayModels) {
      attributedTokensByDay.set(
        entry.day,
        (attributedTokensByDay.get(entry.day) ?? 0) + entry.totals.tokens,
      );
      if (entry.model === model.key) {
        byDay.set(entry.day, entry.totals);
      }
    }
  }

  const chartMetric: "cost" | "tokens" = costUnknown ? "tokens" : "cost";
  const points: CostTrendPoint[] = days.map(({ day, totals: dayTotals }) => {
    const modelDay = byDay.get(day);
    if (modelDay) {
      return {
        day,
        amount: chartMetric === "tokens" ? modelDay.tokens : amount(modelDay),
        label: `${day}: ${chartMetric === "tokens" ? formatCompact(modelDay.tokens) : costValue(modelDay)}`,
      };
    }
    // Days with no unattributed tokens for other models had genuine 0 usage for this model.
    const dayFullyAttributed =
      dayTotals.tokens === 0 || attributedTokensByDay.get(day) === dayTotals.tokens;
    const inactiveVal = dayFullyAttributed ? 0 : undefined;
    return {
      day,
      amount: inactiveVal,
      label: dayFullyAttributed
        ? `${day}: ${chartMetric === "tokens" ? "0" : formatCost(0, currency, locale)}`
        : `${day}: ${t`Unknown`}`,
    };
  });

  const costSegments = costTypeSegments(model.totals, modelAmount, activeBasisIsEstimate);
  const tokenSegments = tokenTypeSegments(model.totals);

  const stats: Array<{ label: string; value: string }> = [
    { label: t`Cost`, value: costUnknown ? t`Unpriced` : costValue(model.totals) },
    { label: t`Tokens`, value: formatCompact(model.totals.tokens) },
    ...(perMillion !== null
      ? [{ label: t`Per 1M tokens`, value: formatCost(perMillion, currency, locale) }]
      : []),
    ...(hitRate !== null ? [{ label: t`Cache hit`, value: formatPercentShare(hitRate) }] : []),
  ];

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && onClose()}>
      <Modal.Container scroll="inside">
        <Modal.Dialog className="p-0 sm:max-w-[680px]" aria-label={model.label || t`Unknown`}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline-soft)] px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {providerKey ? (
                <ProviderIcon
                  kind={providerKey}
                  fallbackLabel={model.label}
                  className="size-5 shrink-0"
                />
              ) : null}
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {model.label || t`Unknown`}
                </h2>
                {costShare !== null ? (
                  <p className="mt-0.5 text-xs text-muted">
                    {t`${formatPercentShare(costShare)} of cost`}
                  </p>
                ) : null}
              </div>
            </div>
            <Button isIconOnly size="sm" variant="ghost" aria-label={t`Close`} onPress={onClose}>
              <X className="size-4" />
            </Button>
          </div>

          <Modal.Body className="@container flex flex-col gap-5 px-5 py-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <ContentSurface key={stat.label} className="min-w-0 px-3 py-2.5">
                  <dt className="text-[11px] text-muted">{stat.label}</dt>
                  <dd className="mt-1 truncate text-lg font-semibold text-foreground tabular-nums">
                    {stat.value}
                  </dd>
                </ContentSurface>
              ))}
            </dl>

            {byDay.size > 0 ? (
              <ContentSurface className="flex flex-col gap-3 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-medium text-foreground">
                    {chartMetric === "tokens" ? (
                      <Trans>Daily tokens</Trans>
                    ) : (
                      <Trans>Daily cost</Trans>
                    )}
                  </h3>
                  {costUnknown ? (
                    <span className="text-[11px] text-muted">
                      <Trans>Showing tokens (model is unpriced)</Trans>
                    </span>
                  ) : null}
                </div>
                <CostTrend
                  points={points}
                  metric={chartMetric}
                  currency={currency}
                  locale={locale}
                />
              </ContentSurface>
            ) : null}

            <CostTypeShareSection
              costSegments={costSegments}
              tokenSegments={tokenSegments}
              currency={currency}
              locale={locale}
            />

            {model.totals.unpricedTokens > 0 ? (
              <p className="text-xs text-muted">
                <Trans>
                  {formatCompact(model.totals.unpricedTokens)} tokens have no known price.
                </Trans>
              </p>
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
