import type { ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileTokenStats } from "@/shared/contracts";
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

export function StatStrip(props: {
  core: ProfileCoreStats;
  tokens: ProfileTokenStats | null;
  tokensLoading: boolean;
}) {
  const { t } = useLingui();
  const { core, tokens, tokensLoading } = props;
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

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      <Tile value={lifetime} label={t`Lifetime tokens`} />
      <Tile
        value={peak}
        label={t`Peak day`}
        {...(tokens?.peakDay ? { sub: formatDayLabel(tokens.peakDay) } : {})}
      />
      <Tile value={formatDuration(totals.longestTaskMs)} label={t`Longest task`} />
      <Tile value={formatDaysLabel(totals.currentStreakDays, t)} label={t`Current streak`} />
      <Tile value={formatDaysLabel(totals.longestStreakDays, t)} label={t`Longest streak`} />
    </div>
  );
}
