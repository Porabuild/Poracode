import type { ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileStatsWindow, ProfileTokenStats } from "@/shared/contracts";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { formatCompact, formatDayLabel, formatDuration } from "../format";

function Skeleton() {
  return <div className="h-6 w-14 animate-pulse rounded-md bg-foreground/10" />;
}

/**
 * Every tile reserves the same fixed heights for the value row (h-7) and the
 * sub row (h-3.5) so the strip never reflows when async token tiles resolve or
 * the peak-day sub-label appears. Numerals use tabular-nums for stable width.
 */
function Tile(props: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 bg-surface-secondary px-3 py-4">
      <div className="flex h-7 items-center text-xl font-semibold tabular-nums text-foreground">
        {props.value}
      </div>
      <div className="text-xs text-muted">{props.label}</div>
      <div className="h-3.5 text-[10px] leading-none text-muted/60">{props.sub ?? ""}</div>
    </div>
  );
}

function formatDaysLabel(days: number, t: TranslateFn): string {
  return days === 1 ? t(msg`${days} day`) : t(msg`${days} days`);
}

/** Display name for a provider key — the stats label when present, else title-case. */
function unavailableProviderLabel(key: string, tokens: ProfileTokenStats): string {
  const known = tokens.providers.find((p) => p.provider === key)?.label;
  if (known) return known;
  return key
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatStrip(props: {
  core: ProfileCoreStats;
  tokens: ProfileTokenStats | null;
  tokensLoading: boolean;
  window: ProfileStatsWindow;
}) {
  const { t } = useLingui();
  const { core, tokens, tokensLoading, window } = props;
  const totals = core.totals;
  const pending = tokensLoading && !tokens;

  const lifetime = pending ? (
    <Skeleton />
  ) : tokens?.available ? (
    formatCompact(tokens.lifetimeTokens)
  ) : (
    "-"
  );
  const peak = pending ? (
    <Skeleton />
  ) : tokens?.available ? (
    formatCompact(tokens.peakDayTokens)
  ) : (
    "-"
  );

  const unavailableLabels =
    tokens?.unavailableProviders.map((key) => unavailableProviderLabel(key, tokens)).join(", ") ??
    "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Tile value={lifetime} label={window === "all" ? t`Lifetime tokens` : t`Total tokens`} />
        <Tile
          value={peak}
          label={t`Peak day`}
          {...(tokens?.peakDay ? { sub: formatDayLabel(tokens.peakDay) } : {})}
        />
        <Tile value={formatDuration(totals.longestTaskMs)} label={t`Longest task`} />
        <Tile value={formatDaysLabel(totals.currentStreakDays, t)} label={t`Current streak`} />
        <Tile value={formatDaysLabel(totals.longestStreakDays, t)} label={t`Longest streak`} />
      </div>
      {tokens && tokens.unavailableProviders.length > 0 ? (
        <p className="text-center text-[10px] text-muted/60">
          <Trans>Token usage unavailable for: {unavailableLabels}</Trans>
        </p>
      ) : null}
    </div>
  );
}
