/** Compact number formatting matching the design refs (e.g. "4.9B", "290.3M", "1.2K"). */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const units: Array<{ limit: number; suffix: string }> = [
    { limit: 1e12, suffix: "T" },
    { limit: 1e9, suffix: "B" },
    { limit: 1e6, suffix: "M" },
    { limit: 1e3, suffix: "K" },
  ];
  for (const { limit, suffix } of units) {
    if (value >= limit) {
      const scaled = value / limit;
      const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
      return `${text.replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(Math.round(value));
}

/** Human task duration, e.g. "1h 27m", "5m 3s", "42s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** "7 days", "1 day", "0 days". */
export function formatDays(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** "123 runs", "1 run". */
export function formatRuns(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "run" : "runs"}`;
}

/** Short, friendly day label from a `YYYY-MM-DD` key (local, no TZ math). */
export function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return day;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** First letters of up to two name parts, uppercased. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
