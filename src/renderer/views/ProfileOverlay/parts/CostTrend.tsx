import { Trans, useLingui } from "@lingui/react/macro";
import { formatCost } from "../format";

export function CostTrend({
  points,
  currency,
  locale,
}: {
  points: Array<{ day: string; amount: number | undefined; label: string }>;
  currency: string;
  locale: string;
}) {
  const { t } = useLingui();
  const max = Math.max(...points.map(({ amount }) => amount ?? 0), 0);
  const hasValues = points.some(({ amount }) => amount !== undefined);
  const width = 600;
  const height = 200;
  const x = (index: number) =>
    points.length > 1 ? 4 + (index / (points.length - 1)) * (width - 8) : width / 2;
  const y = (amount: number) => 4 + (1 - amount / (max || 1)) * (height - 8);
  const paths: string[] = [];
  let path = "";
  for (let index = 0; index < points.length; index++) {
    const amount = points[index]!.amount;
    if (amount === undefined) {
      if (path) paths.push(path);
      path = "";
    } else {
      path += `${path ? " L" : "M"}${x(index)},${y(amount)}`;
    }
  }
  if (path) paths.push(path);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const dateLabel = (day: string) => date.format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid h-40 grid-cols-[auto_minmax(0,1fr)] gap-3 @min-[480px]:h-48">
        <div
          className={`flex flex-col ${max > 0 ? "justify-between" : "justify-end"} py-1 text-right font-mono text-[10px] text-muted tabular-nums`}
          aria-hidden
        >
          {hasValues && (
            <>
              {max > 0 && (
                <>
                  <span>{formatCost(max, currency, locale)}</span>
                  <span>{formatCost(max / 2, currency, locale)}</span>
                </>
              )}
              <span>{formatCost(0, currency, locale)}</span>
            </>
          )}
        </div>
        <div
          className="relative min-w-0"
          role="img"
          aria-label={t`Daily recorded cost; gaps may contain unpriced usage.`}
        >
          <div
            className="pointer-events-none absolute inset-x-0 inset-y-1 flex flex-col justify-between"
            aria-hidden
          >
            {[0, 1, 2].map((line) => (
              <div key={line} className="border-t border-border/40" />
            ))}
          </div>
          {hasValues ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible text-foreground/80"
              aria-hidden
            >
              {paths.map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {points.map(({ day, amount, label }, index) => {
                const left = index === 0 ? 0 : (x(index - 1) + x(index)) / 2;
                const right = index === points.length - 1 ? width : (x(index) + x(index + 1)) / 2;
                return (
                  <g key={day}>
                    <title>{label}</title>
                    {amount !== undefined && (
                      <circle
                        cx={x(index)}
                        cy={y(amount)}
                        r={points.length > 90 ? 1.5 : 2.5}
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
        </div>
      </div>
      <div className="flex justify-between gap-3 text-[10px] text-muted tabular-nums">
        <span>{points[0] ? dateLabel(points[0].day) : ""}</span>
        <span>{points.at(-1) ? dateLabel(points.at(-1)!.day) : ""}</span>
      </div>
    </div>
  );
}
