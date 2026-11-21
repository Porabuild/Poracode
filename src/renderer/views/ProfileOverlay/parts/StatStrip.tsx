import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import type { ReactNode } from "react";
import { Skeleton } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileTokenStats } from "@/shared/contracts";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { formatCompact, formatDayLabel, formatDuration } from "../format";

function ValueSkeleton() {
  return <Skeleton className="h-6 w-16 rounded bg-foreground/10" />;
}

/**
 * Separated left-aligned metric tiles matching Costs' token-category cards.
 * Fixed value height prevents reflow when async token tiles resolve.
 */
function Tile(props: { value: ReactNode; label: string; sub?: string }) {
  return (
    <ContentSurface className="min-w-0 px-3 py-2.5">
      <dt className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">{props.label}</span>
        {props.sub ? <span className="shrink-0 text-muted/75">{props.sub}</span> : null}
      </dt>
      <dd className="mt-1 flex h-7 items-center break-words text-lg font-semibold tabular-nums text-foreground">
        {props.value}
      </dd>
    </ContentSurface>
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
  core: ProfileCoreStats | null;
  coreLoading?: boolean;
  tokens: ProfileTokenStats | null;
  tokensLoading: boolean;
  streaksAvailable?: boolean;
  peakAvailable?: boolean;
}) {
  const { t } = useLingui();
  const { core, coreLoading = false, tokens, tokensLoading } = props;
  const totals = core?.totals;
  const corePending = coreLoading && !totals;
  const tokensPending = tokensLoading && !tokens;

  const peak = tokensPending ? (
    <ValueSkeleton />
  ) : tokens?.available && props.peakAvailable !== false ? (
    formatCompact(tokens.peakDayTokens)
  ) : (
    "-"
  );

  const unavailableLabels =
    tokens?.unavailableProviders.map((key) => unavailableProviderLabel(key, tokens)).join(", ") ??
    "";

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 @min-[640px]:grid-cols-4">
        <Tile
          value={peak}
          label={t`Peak day`}
          {...(tokens?.peakDay && props.peakAvailable !== false
            ? { sub: formatDayLabel(tokens.peakDay) }
            : {})}
        />
        <Tile
          value={corePending || !totals ? <ValueSkeleton /> : formatDuration(totals.longestTaskMs)}
          label={t`Longest task`}
        />
        <Tile
          value={
            corePending || !totals ? (
              <ValueSkeleton />
            ) : props.streaksAvailable === false ? (
              "-"
            ) : (
              formatDaysLabel(totals.currentStreakDays, t)
            )
          }
          label={t`Current streak`}
        />
        <Tile
          value={
            corePending || !totals ? (
              <ValueSkeleton />
            ) : props.streaksAvailable === false ? (
              "-"
            ) : (
              formatDaysLabel(totals.longestStreakDays, t)
            )
          }
          label={t`Longest streak`}
        />
      </dl>
      {tokens && tokens.unavailableProviders.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-muted">
          <Trans>Token usage unavailable for: {unavailableLabels}</Trans>
        </p>
      ) : null}
    </div>
  );
}
