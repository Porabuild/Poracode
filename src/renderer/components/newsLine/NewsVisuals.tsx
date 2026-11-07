import { usageToneColor } from "@/renderer/components/providers/usageTone";

/** A seven-day prompt trend drawn inline with the text. Decorative: the sentence carries the numbers. */
export function NewsSparkline(props: { values: readonly number[] }) {
  const { values } = props;
  if (values.length < 2) return null;
  const width = 48;
  const height = 12;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10;
      const y = Math.round((height - 1 - (value / max) * (height - 2)) * 10) / 10;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      className="ml-1.5 inline-block h-3 w-12 align-middle text-warning"
      data-news-sparkline=""
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact usage bar matching the Usage panel's tone colors. Decorative: the percent is in the text. */
export function NewsUsageMeter(props: { usedPercent: number }) {
  const percent = Math.min(100, Math.max(0, props.usedPercent));
  return (
    <span
      aria-hidden="true"
      className="mx-1.5 inline-block h-1.5 w-14 overflow-hidden rounded-full bg-[var(--default)] align-middle"
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${percent}%`, background: usageToneColor(percent) }}
      />
    </span>
  );
}
