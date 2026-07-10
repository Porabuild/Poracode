import { formatResetCountdown, projectWindowUsage } from "@lightcode/agents-usage/formatters";
import type { UsageProjection } from "@lightcode/agents-usage/formatters";
import type { UsageSnapshot, UsageWindow } from "@lightcode/agents-usage/types";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { usageToneColor } from "./usageTone";
import { isClaudeUsageProvider } from "./usageProviders";

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
 * Pace indicator text for a usage window's forward projection: where the quota
 * is headed by reset at the current burn rate. The tone color is keyed to the
 * projected level (not current usage), so a bar trending into the red reads as
 * a warning even while current usage is still comfortable.
 *
 * - Lasts to reset: "≈N% by reset" — the lower the number, the more room.
 * - Runs out early: "Runs out in 2h 10m" — actionable warning.
 * - Already exhausted: "Ran out · resets in 3d 7h" — countdown is moot, so show
 *   when the quota returns instead.
 */
export function formatPaceSummary(
  projection: UsageProjection,
  resetsAt: number,
  now: number,
): { text: string; toneColor: string } {
  const toneColor = usageToneColor(projection.projectedPercent);
  if (projection.lastsToReset) {
    return { text: i18n._(msg`≈${Math.round(projection.projectedPercent)}% by reset`), toneColor };
  }
  const { runsOutAt } = projection;
  if (runsOutAt === undefined) {
    return { text: i18n._(msg`Over pace — runs out early`), toneColor };
  }
  // Already exhausted: the projected run-out moment is now or in the past, so a
  // "runs out in …" countdown and the "early" warning no longer apply — what's
  // actionable is when the quota comes back.
  if (runsOutAt <= now) {
    const resets = formatResetCountdown(resetsAt, now);
    return {
      text: resets ? i18n._(msg`Ran out · resets in ${resets}`) : i18n._(msg`Ran out`),
      toneColor,
    };
  }
  const runOut = formatResetCountdown(runsOutAt, now);
  return {
    text: runOut ? i18n._(msg`Runs out in ${runOut}`) : i18n._(msg`Runs out early`),
    toneColor,
  };
}

/**
 * Pace summary for a window if one applies, else undefined. Wraps
 * {@link projectWindowUsage} + {@link formatPaceSummary} so callers that only
 * need the text (e.g. the rail tooltip) share one gate. Surfaces that also draw
 * the bar call `projectWindowUsage` directly to reuse the projection object.
 */
export function formatWindowPace(
  w: UsageWindow,
  now: number,
): { text: string; toneColor: string } | undefined {
  const projection = projectWindowUsage(w, now);
  if (!projection || w.resetsAt === undefined) return undefined;
  return formatPaceSummary(projection, w.resetsAt, now);
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
export function usageStatusText(
  snapshot: UsageSnapshot | undefined,
  providerLabel?: string,
  providerId?: string,
  now: number = Date.now(),
): string {
  if (!snapshot) return i18n._(msg`No data yet`);
  switch (snapshot.status) {
    case "ok":
      if (snapshot.credits?.unlimited) {
        return i18n._(msg`Unlimited`);
      }
      if (snapshot.credits) {
        return `${snapshot.credits.label ?? i18n._(msg`Credits`)}: ${formatMoney(
          snapshot.credits.balance,
          snapshot.credits.currency,
        )}`;
      }
      return i18n._(msg`No windows reported`);
    case "auth-missing":
      if (providerId && isClaudeUsageProvider(providerId)) {
        return i18n._(msg`No data yet`);
      }
      return i18n._(msg`Not signed in`);
    case "app-not-running": {
      const appName = providerLabel ?? i18n._(msg`the app`);
      return i18n._(msg`Start ${appName} to see usage`);
    }
    case "rate-limited": {
      // Prefer a concrete countdown from the server's Retry-After when we have
      // one, so the user sees when it recovers instead of an open-ended hint.
      const retry =
        snapshot.rateLimitedUntil !== undefined
          ? formatResetCountdown(snapshot.rateLimitedUntil, now)
          : undefined;
      return retry && retry !== "now"
        ? i18n._(msg`Rate limited · retry in ${retry}`)
        : i18n._(msg`Rate limited. Try again shortly.`);
    }
    case "quota-hit":
      return i18n._(msg`Quota reached`);
    case "unsupported":
      return i18n._(msg`Usage not supported`);
    default:
      return snapshot.error ?? i18n._(msg`Error`);
  }
}
