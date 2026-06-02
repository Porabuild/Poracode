import {
  formatResetCountdown,
  type UsageSnapshot,
  type UsageWindow,
} from "@lightcode/agents-usage";

/** Format a monetary amount (already in the currency's main unit, e.g. dollars). */
export function formatMoney(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return "";
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** Compact token count, e.g. 34900000 -> "34.9M". */
export function formatTokens(count: number | undefined): string {
  if (!count || count <= 0) return "0";
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
  return String(Math.round(count));
}

function formatCount(count: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(count));
}

/**
 * Right-hand value label for a usage window: money for dollar-denominated
 * windows (e.g. "Extra usage"), otherwise a percentage.
 */
export function formatWindowValue(w: UsageWindow): string {
  if (w.unit === "usd" && w.used !== undefined) {
    const used = formatMoney(w.used, w.currency);
    return w.limit !== undefined ? `${used} / ${formatMoney(w.limit, w.currency)}` : used;
  }
  const pct = `${Math.round(w.usedPercent)}%`;
  if (w.unit === "requests" && w.used !== undefined) {
    const requests =
      w.limit !== undefined
        ? `${formatCount(w.used)} / ${formatCount(w.limit)}`
        : formatCount(w.used);
    return `${pct} · ${requests}`;
  }
  return pct;
}

export function formatWindowSecondaryValue(w: UsageWindow): string | undefined {
  if (w.unit === "usd") return undefined;
  if (!w.currency || w.used === undefined) return undefined;
  return w.limit !== undefined
    ? `${formatMoney(w.used, w.currency)} / ${formatMoney(w.limit, w.currency)}`
    : formatMoney(w.used, w.currency);
}

/**
 * Single reset countdown shared across a provider's windows when they all reset
 * on the same clock (e.g. Cursor). Returns undefined when the windows don't
 * share one reset time, so callers fall back to per-window countdowns.
 */
export function sharedWindowResetLabel(
  snapshot: UsageSnapshot | undefined,
  now: number,
): string | undefined {
  if (snapshot?.status !== "ok") return undefined;
  const resetValues = snapshot.windows
    .map((w) => w.resetsAt)
    .filter((value): value is number => value !== undefined);
  if (resetValues.length === 0) return undefined;
  const first = resetValues[0];
  if (!resetValues.every((value) => value === first)) return undefined;
  return formatResetCountdown(first, now);
}

/** Status line for a provider snapshot, shared by the usage card and settings rows. */
export function usageStatusText(snapshot: UsageSnapshot | undefined): string {
  if (!snapshot) return "No data yet";
  switch (snapshot.status) {
    case "ok":
      if (snapshot.credits && !snapshot.credits.unlimited) {
        return `${snapshot.credits.label ?? "Credits"}: ${formatMoney(
          snapshot.credits.balance,
          snapshot.credits.currency,
        )}`;
      }
      return "No windows reported";
    case "auth-missing":
      return "Not signed in";
    case "rate-limited":
      return "Rate limited. Try again shortly.";
    case "quota-hit":
      return "Quota reached";
    case "unsupported":
      return "Usage not supported";
    default:
      return snapshot.error ?? "Error";
  }
}
