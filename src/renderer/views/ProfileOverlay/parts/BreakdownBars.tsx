import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import type { ReactNode } from "react";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileBreakdownEntry } from "@/shared/contracts";

function SkeletonRow() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-3.5 w-28 rounded bg-foreground/10" />
        <Skeleton className="h-3.5 w-10 rounded bg-foreground/10" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full bg-foreground/10" />
    </div>
  );
}

/** A titled list of percent-weighted bars (providers, models, ...). */
export function BreakdownBars(props: {
  title: string;
  caption?: string;
  entries: ProfileBreakdownEntry[];
  limit?: number;
  loading?: boolean;
  loadingRows?: number;
  emptyText?: string;
  footer?: ReactNode;
  /** Formats the raw count shown next to the percent (default `toLocaleString`). */
  formatValue?: (count: number) => string;
}) {
  const { t } = useLingui();
  const {
    title,
    caption,
    entries,
    limit = 6,
    loading = false,
    loadingRows = 4,
    emptyText,
    footer,
    formatValue = (n) => n.toLocaleString(),
  } = props;
  const rows = entries.slice(0, limit);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {caption ? <span className="text-xs text-muted">{caption}</span> : null}
      </div>
      <ContentSurface className="flex flex-1 flex-col gap-3 p-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted">{emptyText ?? t`No data yet.`}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((entry) => (
              <div key={entry.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="truncate font-medium text-foreground">{entry.label}</span>
                  <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                    <span className="text-muted">{formatValue(entry.count)}</span>
                    <span className="text-muted/60">{entry.percent}%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${Math.min(100, Math.max(2, entry.percent))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ContentSurface>
      {footer}
    </section>
  );
}
