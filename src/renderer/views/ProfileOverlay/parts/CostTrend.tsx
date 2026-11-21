import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { formatCompact, formatCost } from "../format";
import { buildMonotoneLinePath, providerColor, type ChartPoint } from "./costBreakdown";

const EMPTY_SERIES: readonly CostTrendSeries[] = [];
const MAX_TOOLTIP_WIDTH_PX = 240;
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = DATE_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    DATE_FORMATTERS.set(locale, formatter);
  }
  return formatter;
}

export interface CostTrendPoint {
  day: string;
  amount: number | undefined;
  label: string;
  /** Optional per-provider breakdown for multi-series curves and hover tooltips. */
  byProvider?: Readonly<Record<string, number | undefined>>;
}

export interface CostTrendSeries {
  key: string;
  label: string;
}

export function CostTrend({
  points,
  series = EMPTY_SERIES,
  metric = "cost",
  currency,
  locale,
}: {
  points: CostTrendPoint[];
  series?: readonly CostTrendSeries[];
  metric?: "cost" | "tokens";
  currency: string;
  locale: string;
}) {
  const { t } = useLingui();
  const [hover, setHover] = useState<{ index: number; left: number; top: number } | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  const hasMultiSeries =
    series.length > 0 && points.some((p) => p.byProvider && Object.keys(p.byProvider).length > 0);

  const max = hasMultiSeries
    ? points.reduce((peak, p) => {
        let rowPeak = peak;
        for (const s of series) {
          const val = p.byProvider?.[s.key];
          if (val !== undefined && val > rowPeak) rowPeak = val;
        }
        return rowPeak;
      }, 0)
    : Math.max(...points.map(({ amount }) => amount ?? 0), 0);

  const hasValues = hasMultiSeries
    ? points.some((p) => series.some((s) => p.byProvider?.[s.key] !== undefined))
    : points.some(({ amount }) => amount !== undefined);

  const formatValue = (value: number) =>
    metric === "tokens" ? formatCompact(value) : formatCost(value, currency, locale);

  const width = 600;
  const height = 200;
  const plotBottom = height - 4;
  const x = (index: number) =>
    points.length > 1 ? 4 + (index / (points.length - 1)) * (width - 8) : width / 2;
  const y = (amount: number) => 4 + (1 - amount / (max || 1)) * (height - 8);

  // Contiguous runs preserve gaps over unknown/unpriced days (never interpolating through missing history).
  const buildRuns = (
    pick: (point: CostTrendPoint) => number | undefined,
  ): Array<{ line: string; area: string; run: ChartPoint[] }> => {
    const runs: Array<{ line: string; area: string; run: ChartPoint[] }> = [];
    let current: ChartPoint[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const line = buildMonotoneLinePath(current);
      const area =
        current.length >= 2
          ? `${line} L${current[current.length - 1]!.x.toFixed(2)},${plotBottom} L${current[0]!.x.toFixed(2)},${plotBottom} Z`
          : "";
      runs.push({ line, area, run: current });
      current = [];
    };
    for (let index = 0; index < points.length; index++) {
      const value = pick(points[index]!);
      if (value === undefined) {
        flush();
      } else {
        current.push({ x: x(index), y: y(value) });
      }
    }
    flush();
    return runs;
  };

  const singleRuns = hasMultiSeries ? [] : buildRuns((p) => p.amount);
  const multiSeriesPaths = hasMultiSeries
    ? series
        .map((s) => {
          const runs = buildRuns((p) => p.byProvider?.[s.key]);
          const total = points.reduce((sum, p) => sum + (p.byProvider?.[s.key] ?? 0), 0);
          return { ...s, color: providerColor(s.key), runs, total };
        })
        // Draw largest series first so smaller provider lines remain clearly visible on top.
        .toSorted((a, b) => b.total - a.total)
    : [];

  const date = getDateFormatter(locale);
  const dateLabel = (day: string) => date.format(new Date(`${day}T00:00:00Z`));
  const midIndex = points.length > 2 ? Math.floor(points.length / 2) : -1;

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || !hasValues || points.length === 0) return;

    const updateHover = (event: PointerEvent) => {
      const bounds = plot.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const localX = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
      const localY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
      const index =
        points.length > 1 ? Math.round((localX / bounds.width) * (points.length - 1)) : 0;
      const clamped = Math.min(points.length - 1, Math.max(0, index));
      const tooltipWidth = Math.min(MAX_TOOLTIP_WIDTH_PX, bounds.width);
      const tooltipHeight = Math.min(200, 56 + (hasMultiSeries ? series.length : 1) * 20);
      const preferredLeft =
        localX + 12 + tooltipWidth <= bounds.width ? localX + 12 : localX - 12 - tooltipWidth;
      const preferredTop =
        localY + 12 + tooltipHeight <= bounds.height ? localY + 12 : localY - 12 - tooltipHeight;
      const left = Math.min(Math.max(0, preferredLeft), Math.max(0, bounds.width - tooltipWidth));
      const top = Math.min(Math.max(0, preferredTop), Math.max(0, bounds.height - tooltipHeight));
      setHover({ index: clamped, left, top });
    };

    const clearHover = () => setHover(null);

    plot.addEventListener("pointermove", updateHover);
    plot.addEventListener("pointerdown", updateHover);
    plot.addEventListener("pointerleave", clearHover);
    return () => {
      plot.removeEventListener("pointermove", updateHover);
      plot.removeEventListener("pointerdown", updateHover);
      plot.removeEventListener("pointerleave", clearHover);
      setHover(null);
    };
  }, [hasMultiSeries, hasValues, points.length, series.length]);

  const activeHover = hasValues && hover && hover.index < points.length ? hover : null;
  const hovered = activeHover ? points[activeHover.index] : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="grid min-h-44 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-3 @min-[480px]:min-h-56">
        <div
          className={`flex flex-col ${max > 0 ? "justify-between" : "justify-end"} py-1 text-right font-mono text-[10px] text-muted tabular-nums`}
          aria-hidden="true"
        >
          {hasValues && (
            <>
              {max > 0 && (
                <>
                  <span>{formatValue(max)}</span>
                  <span>{formatValue(max / 2)}</span>
                </>
              )}
              <span>{formatValue(0)}</span>
            </>
          )}
        </div>
        <div
          ref={plotRef}
          className="relative min-w-0"
          role="img"
          aria-label={
            metric === "tokens"
              ? t`Daily recorded tokens.`
              : t`Daily recorded cost; gaps may contain unpriced usage.`
          }
        >
          <div
            className="pointer-events-none absolute inset-x-0 inset-y-1 flex flex-col justify-between"
            aria-hidden="true"
          >
            {[0, 1, 2].map((line) => (
              <div key={line} className="border-t border-[var(--hairline-soft)]" />
            ))}
          </div>
          {hasValues ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible text-foreground/85"
              aria-hidden="true"
            >
              {hasMultiSeries ? (
                <>
                  {multiSeriesPaths.map((s) =>
                    s.runs.map((run, idx) =>
                      run.area ? (
                        <path
                          key={`${s.key}-area-${idx}`}
                          d={run.area}
                          fill={s.color}
                          fillOpacity={0.12}
                        />
                      ) : null,
                    ),
                  )}
                  {multiSeriesPaths.map((s) =>
                    s.runs.map((run, idx) => (
                      <path
                        key={`${s.key}-line-${idx}`}
                        d={run.line}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    )),
                  )}
                  {/* Isolated single-day runs have 0px stroke length, so paint an explicit marker dot. */}
                  {multiSeriesPaths.map((s) =>
                    s.runs.map((run, idx) =>
                      run.run.length === 1 ? (
                        <circle
                          key={`${s.key}-solo-${idx}`}
                          cx={run.run[0]!.x}
                          cy={run.run[0]!.y}
                          r={2.5}
                          fill={s.color}
                        />
                      ) : null,
                    ),
                  )}
                </>
              ) : (
                <>
                  {singleRuns.map((run, idx) => (
                    <path
                      key={`line-${idx}`}
                      d={run.line}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </>
              )}

              {activeHover && hovered ? (
                <>
                  <line
                    x1={x(activeHover.index)}
                    x2={x(activeHover.index)}
                    y1={4}
                    y2={plotBottom}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-muted"
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {hasMultiSeries &&
                    multiSeriesPaths.map((s) => {
                      const val = hovered.byProvider?.[s.key];
                      if (val === undefined) return null;
                      return (
                        <circle
                          key={`${s.key}-hover`}
                          cx={x(activeHover.index)}
                          cy={y(val)}
                          r={3.5}
                          fill={s.color}
                        />
                      );
                    })}
                </>
              ) : null}

              {points.map(({ day, amount, label }, index) => {
                const left = index === 0 ? 0 : (x(index - 1) + x(index)) / 2;
                const right = index === points.length - 1 ? width : (x(index) + x(index + 1)) / 2;
                const isHovered = activeHover?.index === index;
                return (
                  <g key={day}>
                    <title>{label}</title>
                    {!hasMultiSeries && amount !== undefined && (
                      <circle
                        cx={x(index)}
                        cy={y(amount)}
                        r={isHovered ? 3.5 : points.length > 90 ? 1.5 : 2.5}
                        fill="currentColor"
                      />
                    )}
                    <rect x={left} y="0" width={right - left} height={height} fill="transparent" />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              <Trans>No priced usage in this range.</Trans>
            </div>
          )}

          {activeHover && hovered ? (
            <div
              className="pointer-events-none absolute z-20 min-w-[164px] max-w-[240px] rounded-xl border border-[var(--hairline)] bg-background/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur-md"
              style={{ left: `${activeHover.left}px`, top: `${activeHover.top}px` }}
            >
              <div className="mb-1 text-[11px] font-medium text-muted">
                {dateLabel(hovered.day)}
              </div>
              <div className="flex flex-col gap-1">
                {hasMultiSeries
                  ? series.map((s) => {
                      const val = hovered.byProvider?.[s.key];
                      if (val === undefined) return null;
                      return (
                        <div key={s.key} className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-1.5 text-muted">
                            <span
                              aria-hidden="true"
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: providerColor(s.key) }}
                            />
                            <ProviderIcon
                              kind={s.key}
                              fallbackLabel={s.label}
                              className="size-3 shrink-0"
                            />
                            <span className="truncate">{s.label}</span>
                          </span>
                          <span className="shrink-0 font-medium text-foreground tabular-nums">
                            {formatValue(val)}
                          </span>
                        </div>
                      );
                    })
                  : null}
                <div
                  className={`flex items-center justify-between gap-3 ${
                    hasMultiSeries ? "mt-0.5 border-t border-[var(--hairline-soft)] pt-1" : ""
                  }`}
                >
                  <span className="text-muted">
                    <Trans>Total</Trans>
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {hovered.amount !== undefined ? formatValue(hovered.amount) : t`Unknown`}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex justify-between gap-3 text-[10px] text-muted tabular-nums">
        <span>{points[0] ? dateLabel(points[0].day) : ""}</span>
        {midIndex > 0 && points[midIndex] ? (
          <span className="hidden @min-[480px]:inline">{dateLabel(points[midIndex]!.day)}</span>
        ) : null}
        <span>{points.at(-1) ? dateLabel(points.at(-1)!.day) : ""}</span>
      </div>
    </div>
  );
}
