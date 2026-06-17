import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type {
  ProfileHeatmap,
  ProfileHeatmapCell,
  ProfileHeatmapIntensity,
} from "@/shared/contracts";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { formatCompact, formatDayLabel } from "../format";

/** Monochrome ramp built from the theme foreground (white in dark, black in light). */
function colorFor(intensity: ProfileHeatmapIntensity): string {
  switch (intensity) {
    case 0:
      return "color-mix(in oklab, var(--foreground) 8%, transparent)";
    case 1:
      return "color-mix(in oklab, var(--foreground) 32%, transparent)";
    case 2:
      return "color-mix(in oklab, var(--foreground) 55%, transparent)";
    case 3:
      return "color-mix(in oklab, var(--foreground) 78%, transparent)";
    case 4:
      return "var(--foreground)";
  }
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function monthOf(day: string): number {
  return Number.parseInt(day.split("-")[1] ?? "1", 10) - 1;
}

function tooltipFor(
  cell: ProfileHeatmapCell,
  metric: ProfileHeatmap["metric"],
  t: TranslateFn,
): string {
  const when = formatDayLabel(cell.day);
  if (metric === "tokens") return t(msg`${formatCompact(cell.count)} tokens - ${when}`);
  return cell.count === 1
    ? t(msg`${cell.count} prompt - ${when}`)
    : t(msg`${cell.count} prompts - ${when}`);
}

function buildColumns(
  cells: readonly ProfileHeatmapCell[],
  monthNames: readonly string[],
): {
  columns: Array<Array<ProfileHeatmapCell | null>>;
  monthLabels: Array<string | null>;
} {
  const grid: (ProfileHeatmapCell | null)[] = [];
  if (cells.length > 0) {
    const lead = weekdayOf(cells[0]!.day);
    for (let i = 0; i < lead; i++) grid.push(null);
  }
  grid.push(...cells);
  while (grid.length % 7 !== 0) grid.push(null);

  const columns: Array<Array<ProfileHeatmapCell | null>> = [];
  for (let i = 0; i < grid.length; i += 7) columns.push(grid.slice(i, i + 7));

  const monthLabels: Array<string | null> = [];
  let prevMonth = -1;
  for (const col of columns) {
    const first = col.find((c): c is ProfileHeatmapCell => c !== null);
    if (!first) {
      monthLabels.push(null);
      continue;
    }
    const month = monthOf(first.day);
    if (month !== prevMonth) {
      monthLabels.push(monthNames[month]!);
      prevMonth = month;
    } else {
      monthLabels.push(null);
    }
  }
  return { columns, monthLabels };
}

export function ActivityHeatmap(props: { heatmap: ProfileHeatmap }) {
  const { t, i18n } = useLingui();
  const { heatmap } = props;
  const monthFormatter = new Intl.DateTimeFormat(i18n.locale, {
    month: "short",
    timeZone: "UTC",
  });
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    monthFormatter.format(new Date(Date.UTC(2026, month, 1))),
  );
  const { columns, monthLabels } = buildColumns(heatmap.cells, monthNames);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-[3px] text-[10px] leading-none text-muted">
        {monthLabels.map((label, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {label ?? " "}
          </div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {col.map((cell, j) =>
              cell ? (
                <div
                  key={j}
                  className="aspect-square w-full rounded-[2px]"
                  style={{ backgroundColor: colorFor(cell.intensity) }}
                  title={tooltipFor(cell, heatmap.metric, t)}
                />
              ) : (
                <div key={j} className="aspect-square w-full" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-muted">
        <span>{t`Less`}</span>
        {([0, 1, 2, 3, 4] as ProfileHeatmapIntensity[]).map((level) => (
          <div
            key={level}
            className="size-2.5 rounded-[2px]"
            style={{ backgroundColor: colorFor(level) }}
          />
        ))}
        <span>{t`More`}</span>
      </div>
    </div>
  );
}
