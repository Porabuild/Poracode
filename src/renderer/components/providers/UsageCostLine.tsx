import { useLingui } from "@lingui/react/macro";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { formatMoney, formatTokens } from "./usageFormat";

/** Shared billed or estimated cost line for usage cards and rail tooltips. */
export function UsageCostLine(props: { snapshot: UsageSnapshot; className?: string }) {
  const { t } = useLingui();
  const { snapshot, className } = props;
  if (!snapshot.cost) return null;

  const tokens = snapshot.tokens?.total
    ? ` · ${t`${formatTokens(snapshot.tokens.total)} tokens`}`
    : "";
  const money = formatMoney(snapshot.cost.amount, snapshot.cost.currency);
  const line = snapshot.cost.estimated
    ? t`~${money}${tokens} · ${snapshot.cost.period} · est.`
    : `${money}${tokens} · ${snapshot.cost.period}`;

  return <p className={className ?? "truncate text-[11px] text-muted"}>{line}</p>;
}
