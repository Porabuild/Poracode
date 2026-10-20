import { useId, useState } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  evaluateNativeVisualValue,
  type NativeVisualChart as ChartSpec,
  type NativeVisualTable as TableSpec,
} from "@/shared/nativeVisuals";
import type {
  NativeVisualChartView,
  NativeVisualTableView,
} from "@/renderer/state/nativeVisualUiStore";
import { NativeVisualTable, formatNativeVisualNumber } from "./NativeVisualTable";

const COLORS = [
  "var(--native-visual-accent,var(--accent))",
  "var(--success)",
  "var(--warning)",
  "var(--foreground)",
] as const;

export function NativeVisualChart({
  block,
  inputs,
  view,
  onViewChange,
  tableView,
  onTableViewChange,
}: {
  block: ChartSpec;
  inputs: ReadonlyMap<string, number>;
  view: NativeVisualChartView;
  onViewChange: (view: NativeVisualChartView) => void;
  tableView: NativeVisualTableView;
  onTableViewChange: (view: NativeVisualTableView) => void;
}) {
  const { t, i18n } = useLingui();
  const titleId = useId();
  const [hovered, setHovered] = useState<number>();
  const point = Math.min(view.point, block.labels.length - 1);
  const inspected = hovered ?? point;
  const allSeries = block.series.map((series, index) => ({
    ...series,
    index,
    evaluated: series.values.map((value) => evaluateNativeVisualValue(value, inputs)),
  }));
  const evaluatedSeries = allSeries.filter((series) => !view.hiddenSeries.includes(series.index));
  const values = evaluatedSeries.flatMap((series) =>
    series.evaluated.filter((value): value is number => value !== null),
  );
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values) || (min === 0 ? 1 : 0);
  const span = max - min || 1;
  const number = (value: number | null) =>
    formatNativeVisualNumber(value, block.format, i18n.locale, t`Unavailable`);
  const axisNumber = (value: number) =>
    new Intl.NumberFormat(i18n.locale, {
      ...(block.format ?? { style: "decimal" as const }),
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const table: TableSpec = {
    type: "table",
    title: block.title || t`Chart data`,
    columns: [
      { label: t`Category` },
      ...block.series.map((series) => ({
        label: series.label,
        ...(block.format ? { format: block.format } : {}),
      })),
    ],
    rows: block.labels.map((label, index) => [
      label,
      ...block.series.map((series) => series.values[index]!),
    ]),
  };
  const rowHeight = Math.max(44, evaluatedSeries.length * 25 + 14);
  const barHeight = block.labels.length * rowHeight + 45;
  const barX = (value: number) => 155 + ((value - min) / span) * 385;
  const lineX = (index: number) =>
    65 + (block.labels.length === 1 ? 285 : (index / (block.labels.length - 1)) * 570);
  const lineY = (value: number) => 205 - ((value - min) / span) * 165;
  function inspectPoint(nextPoint: number) {
    setHovered(undefined);
    onViewChange({ ...view, point: nextPoint });
  }
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {allSeries.map((series) => (
            <Button
              key={series.index}
              size="sm"
              variant="ghost"
              isDisabled={view.showTable}
              aria-pressed={view.showTable || !view.hiddenSeries.includes(series.index)}
              onPress={() =>
                onViewChange({
                  ...view,
                  hiddenSeries: view.hiddenSeries.includes(series.index)
                    ? view.hiddenSeries.filter((index) => index !== series.index)
                    : [...view.hiddenSeries, series.index],
                })
              }
              className={`gap-1.5 px-1 text-xs ${!view.showTable && view.hiddenSeries.includes(series.index) ? "opacity-45" : ""}`}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: COLORS[series.index] }}
              />
              {series.label}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setHovered(undefined);
            onViewChange({ ...view, showTable: !view.showTable });
          }}
        >
          {view.showTable ? t`Show chart` : t`Show data table`}
        </Button>
      </div>
      {view.showTable ? (
        <NativeVisualTable
          block={table}
          inputs={inputs}
          view={tableView}
          onViewChange={onTableViewChange}
        />
      ) : !evaluatedSeries.length ? (
        <p
          role="status"
          className="rounded-[0.875rem] bg-surface-secondary/40 p-4 text-sm text-muted"
        >{t`No series selected. Choose a series above.`}</p>
      ) : (
        <div
          className="rounded-[0.875rem] bg-surface-secondary/40"
          onPointerLeave={() => setHovered(undefined)}
        >
          <svg
            viewBox={`0 0 800 ${block.kind === "bar" ? barHeight : 250}`}
            className="w-full min-w-[420px] text-muted"
            role="img"
            aria-labelledby={titleId}
          >
            <title id={titleId}>{block.title || t`Chart`}</title>
            {block.kind === "bar" ? (
              <>
                <line
                  x1={barX(0)}
                  x2={barX(0)}
                  y1={15}
                  y2={barHeight - 30}
                  stroke="currentColor"
                  opacity={0.25}
                />
                <text x={155} y={barHeight - 10} fill="currentColor" fontSize={11}>
                  {axisNumber(min)}
                </text>
                <text x={540} y={barHeight - 10} textAnchor="end" fill="currentColor" fontSize={11}>
                  {axisNumber(max)}
                </text>
                {block.labels.map((label, index) => (
                  <g key={index} onPointerEnter={() => setHovered(index)}>
                    {index === inspected ? (
                      <rect
                        x={0}
                        y={index * rowHeight}
                        width={800}
                        height={rowHeight}
                        fill="currentColor"
                        opacity={0.035}
                      />
                    ) : null}
                    <text
                      x={12}
                      y={index * rowHeight + rowHeight / 2 + 4}
                      fill="currentColor"
                      fontSize={12}
                    >
                      <title>{label}</title>
                      {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                    </text>
                    {evaluatedSeries.map((series, seriesIndex) => {
                      const value = series.evaluated[index]!;
                      const y = index * rowHeight + seriesIndex * 25 + 12;
                      return (
                        <g key={seriesIndex}>
                          {value !== null ? (
                            <rect
                              x={Math.min(barX(0), barX(value))}
                              y={y}
                              width={Math.abs(barX(value) - barX(0))}
                              height={17}
                              rx={4}
                              fill={COLORS[series.index]}
                              opacity={0.85}
                            >
                              <title>{`${label} · ${series.label}: ${number(value)}`}</title>
                            </rect>
                          ) : null}
                          <text
                            x={565}
                            y={y + 13}
                            fill="currentColor"
                            fontSize={12}
                            className="tabular-nums"
                          >
                            {number(value)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                ))}
              </>
            ) : (
              <>
                <line
                  x1={lineX(inspected)}
                  x2={lineX(inspected)}
                  y1={25}
                  y2={215}
                  stroke="currentColor"
                  opacity={0.2}
                  strokeDasharray="4 4"
                />
                {[min, min + span / 2, max].map((value, index) => (
                  <g key={index}>
                    <line
                      x1={65}
                      x2={635}
                      y1={lineY(value)}
                      y2={lineY(value)}
                      stroke="currentColor"
                      opacity={0.12}
                    />
                    <text
                      x={58}
                      y={lineY(value) + 4}
                      textAnchor="end"
                      fill="currentColor"
                      fontSize={10}
                    >
                      {axisNumber(value)}
                    </text>
                  </g>
                ))}
                {evaluatedSeries.map((series, seriesIndex) => {
                  const segments: string[][] = [[]];
                  series.evaluated.forEach((value, index) => {
                    if (value === null) segments.push([]);
                    else segments[segments.length - 1]!.push(`${lineX(index)},${lineY(value)}`);
                  });
                  return (
                    <g key={seriesIndex}>
                      {segments
                        .filter((segment) => segment.length > 1)
                        .map((segment, index) => (
                          <polyline
                            key={index}
                            points={segment.join(" ")}
                            fill="none"
                            stroke={COLORS[series.index]}
                            strokeWidth={2.5}
                            strokeLinejoin="round"
                            strokeDasharray={
                              series.index
                                ? `${series.index * 3 + 2} ${series.index + 2}`
                                : undefined
                            }
                          />
                        ))}
                      {series.evaluated.map((value, index) =>
                        value === null ? null : (
                          <circle
                            key={index}
                            cx={lineX(index)}
                            cy={lineY(value)}
                            r={index === inspected ? 5 : 3.5}
                            fill={COLORS[series.index]}
                            onPointerEnter={() => setHovered(index)}
                          >
                            <title>{`${block.labels[index]} · ${series.label}: ${number(value)}`}</title>
                          </circle>
                        ),
                      )}
                    </g>
                  );
                })}
                {block.labels.map((label, index) =>
                  block.labels.length <= 8 || index === 0 || index === block.labels.length - 1 ? (
                    <text
                      key={index}
                      x={lineX(index)}
                      y={235}
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize={11}
                    >
                      <title>{label}</title>
                      {label.length > 12 ? `${label.slice(0, 11)}…` : label}
                    </text>
                  ) : null,
                )}
              </>
            )}
          </svg>
        </div>
      )}
      {!view.showTable && evaluatedSeries.length ? (
        <div
          className="flex items-center gap-2 rounded-[0.875rem] bg-surface-secondary/40 px-2 py-2"
          role="group"
          aria-label={t`Chart inspection`}
        >
          {block.labels.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={t`Previous category`}
              isDisabled={point === 0}
              onPress={() => inspectPoint(point - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-1" aria-live="polite">
            <p className="break-words text-xs font-medium">{block.labels[inspected]}</p>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {evaluatedSeries.map((series) => (
                <div key={series.index} className="flex gap-1.5">
                  <dt className="text-muted">{series.label}</dt>
                  <dd className="font-medium tabular-nums">
                    {number(series.evaluated[inspected]!)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {block.labels.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={t`Next category`}
              isDisabled={point === block.labels.length - 1}
              onPress={() => inspectPoint(point + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {!view.showTable &&
      values.length !== evaluatedSeries.reduce((sum, series) => sum + series.values.length, 0) ? (
        <p
          role="status"
          className="text-xs text-muted"
        >{t`Some values are unavailable. Check the calculator inputs.`}</p>
      ) : null}
    </div>
  );
}
