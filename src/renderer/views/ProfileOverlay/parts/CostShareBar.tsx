import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { formatCompact, formatCost } from "../format";
import { formatPercentShare, type CostShareSegment } from "./costBreakdown";

/**
 * Horizontal proportional segmented bar with hover tooltips and a compact
 * color-coded legend (ported from t3code's UsageShareBar into HeroUI v3).
 */
export function CostShareBar(props: {
  label: string;
  segments: readonly CostShareSegment[];
  format: (value: number) => string;
  aside?: ReactNode;
}) {
  const { t } = useLingui();
  const { label, segments, format, aside } = props;
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium text-foreground">{label}</h3>
        {aside}
      </div>
      {/* Legend below carries all values for screen readers; bar tooltips are pointer-only. */}
      <div aria-hidden="true" className="flex h-2 gap-0.5">
        {visible.map((segment) => {
          const segmentLabel = t(segment.label);
          return (
            <Tooltip key={segment.id} delay={100}>
              <Tooltip.Trigger
                tabIndex={-1}
                role="none"
                className="h-full min-w-1 overflow-hidden rounded-[2px] first:rounded-l-full last:rounded-r-full"
                style={{ flex: `${segment.value} 1 0` }}
              >
                <div className="h-full w-full" style={{ backgroundColor: segment.color }} />
              </Tooltip.Trigger>
              <Tooltip.Content className="text-xs tabular-nums">
                {segmentLabel} · {format(segment.value)} ·{" "}
                {formatPercentShare(segment.value / total)}
              </Tooltip.Content>
            </Tooltip>
          );
        })}
      </div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {visible.map((segment) => {
          const segmentLabel = t(segment.label);
          return (
            <div key={segment.id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-muted">{segmentLabel}</span>
              <span className="font-medium text-foreground tabular-nums">
                {format(segment.value)}
              </span>
              <span className="sr-only">, {formatPercentShare(segment.value / total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Shared paired `Cost by type` + `Tokens by type` card used by CostHistory and CostModelDialog. */
export function CostTypeShareSection(props: {
  costSegments: readonly CostShareSegment[];
  tokenSegments: readonly CostShareSegment[];
  currency: string;
  locale: string;
  costAside?: ReactNode;
  className?: string;
}) {
  const { t } = useLingui();
  const { costSegments, tokenSegments, currency, locale, costAside, className = "" } = props;
  if (costSegments.length === 0 && tokenSegments.length === 0) return null;

  return (
    <ContentSurface className={`grid grid-cols-1 gap-6 p-4 @min-[640px]:grid-cols-2 ${className}`}>
      {costSegments.length > 0 ? (
        <CostShareBar
          label={t`Cost by type`}
          segments={costSegments}
          format={(value) => formatCost(value, currency, locale)}
          aside={costAside}
        />
      ) : null}
      {tokenSegments.length > 0 ? (
        <CostShareBar label={t`Tokens by type`} segments={tokenSegments} format={formatCompact} />
      ) : null}
    </ContentSurface>
  );
}
