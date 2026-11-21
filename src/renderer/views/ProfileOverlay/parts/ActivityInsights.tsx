import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useState } from "react";
import { Button, Chip, Skeleton } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Plural, useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileStatsWindow, ProfileTokenStats } from "@/shared/contracts";
import { buildProfileInsightFacts, type ProfileEnvSummary } from "@/shared/profile/insights";
import { renderInsightFact } from "@/renderer/components/newsLine/insightContent";
import { formatCompact, formatDuration } from "../format";

const INSIGHTS_PER_PAGE = 6;

function chipColor(
  tone: "neutral" | "positive" | "negative" | "accent" | "warning",
): "default" | "success" | "danger" | "accent" | "warning" {
  switch (tone) {
    case "positive":
      return "success";
    case "negative":
      return "danger";
    case "accent":
      return "accent";
    case "warning":
      return "warning";
    case "neutral":
      return "default";
  }
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-xs">
      <span className="text-muted">{props.label}</span>
      <span className="font-medium tabular-nums text-foreground">{props.value}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <Skeleton className="h-3.5 w-32 rounded bg-foreground/10" />
      <Skeleton className="h-3.5 w-14 rounded bg-foreground/10" />
    </div>
  );
}

function PulseCard(props: {
  label: string;
  value: string;
  sub: string;
  badge?: { label: string; tone: "neutral" | "positive" | "negative" | "accent" | "warning" };
}) {
  return (
    <ContentSurface className="flex min-w-0 flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted">{props.label}</span>
        {props.badge ? (
          <Chip size="sm" variant="soft" color={chipColor(props.badge.tone)}>
            {props.badge.label}
          </Chip>
        ) : null}
      </div>
      <div className="truncate text-lg font-semibold tabular-nums text-foreground">
        {props.value}
      </div>
      <div className="truncate text-xs text-muted">{props.sub}</div>
    </ContentSurface>
  );
}

export function ActivityInsights(props: {
  core: ProfileCoreStats | null;
  tokens?: ProfileTokenStats | null;
  envs?: readonly ProfileEnvSummary[];
  window?: ProfileStatsWindow;
  loading?: boolean;
  className?: string;
  skillsAvailable?: boolean;
}) {
  const { t, i18n } = useLingui();
  const { core, tokens = null, envs = [], window = "all", loading = false, className = "" } = props;
  const [pagination, setPagination] = useState<{
    key: string;
    page: number;
    motion: "none" | "from-right" | "from-left";
  }>({ key: "", page: 0, motion: "none" });

  if (loading || !core) {
    return (
      <section className={`flex min-w-0 flex-col gap-3 ${className}`}>
        <h2 className="text-sm font-semibold text-foreground">{t`Activity insights`}</h2>
        <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ContentSurface key={i} className="flex flex-col gap-2 px-3.5 py-3">
              <Skeleton className="h-3 w-20 rounded bg-foreground/10" />
              <Skeleton className="h-6 w-24 rounded bg-foreground/10" />
              <Skeleton className="h-3.5 w-32 rounded bg-foreground/10" />
            </ContentSurface>
          ))}
        </div>
        <ContentSurface className="grid grid-cols-1 px-4 py-1 @min-[640px]:grid-cols-2 @min-[640px]:gap-x-8">
          <div className="divide-y divide-[var(--hairline-soft)]">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
          <div className="divide-y divide-[var(--hairline-soft)] border-t border-[var(--hairline-soft)] @min-[640px]:border-t-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </ContentSurface>
      </section>
    );
  }

  const { insights, totals, recent } = core;
  const facts = buildProfileInsightFacts({ core, tokens, envs }).toSorted(
    (a, b) => b.priority - a.priority,
  );
  // All accounts is the default scope. Switching account, device, or range
  // replaces the highlight set, so the carousel returns to the first page of
  // that merged list without firing a render-time setState on mount.
  const factsIdentity = [
    window,
    core.scope,
    core.device.id,
    totals.totalPrompts,
    totals.totalThreads,
    tokens?.lifetimeTokens ?? 0,
    core.accounts.map((account) => `${account.key}:${account.count}`).join(","),
    facts.map((fact) => fact.id).join("\0"),
  ].join("|");
  const totalPages = Math.max(1, Math.ceil(facts.length / INSIGHTS_PER_PAGE));
  const currentPage =
    pagination.key === factsIdentity ? Math.min(pagination.page, totalPages - 1) : 0;
  const slideMotion = pagination.key === factsIdentity ? pagination.motion : "none";
  const pageStart = currentPage * INSIGHTS_PER_PAGE;
  const visibleFacts = facts.slice(pageStart, pageStart + INSIGHTS_PER_PAGE);
  const slideMotionClass =
    slideMotion === "from-right"
      ? "poracode-tab-panel-from-right"
      : slideMotion === "from-left"
        ? "poracode-tab-panel-from-left"
        : "";
  const goToPage = (nextPage: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
    if (clamped === currentPage) return;
    setPagination({
      key: factsIdentity,
      page: clamped,
      motion: clamped > currentPage ? "from-right" : "from-left",
    });
  };

  // Period pulse summaries
  const compareMonthly = window === "30d";
  const currentPeriod = recent ? (compareMonthly ? recent.last30d : recent.last7d) : null;
  const priorPeriod = recent ? (compareMonthly ? recent.prev30d : recent.prev7d) : null;
  const periodDelta =
    currentPeriod && priorPeriod ? pctDelta(currentPeriod.prompts, priorPeriod.prompts) : null;
  const avgTurnMs =
    currentPeriod && currentPeriod.prompts > 0 && currentPeriod.totalTurnMs > 0
      ? currentPeriod.totalTurnMs / currentPeriod.prompts
      : 0;

  const yesterday = recent?.yesterday;
  const yTokens = tokens?.recent?.yesterday.tokens ?? 0;
  const yesterdayValue = yesterday
    ? `${yesterday.prompts.toLocaleString()} ${yesterday.prompts === 1 ? t`prompt` : t`prompts`}`
    : "-";
  const yesterdaySub = yesterday
    ? yesterday.prompts === 0
      ? t`No prompts yesterday`
      : yesterday.providers[0]
        ? `${yesterday.providers[0].label} · ${Math.round(yesterday.providers[0].percent)}%`
        : yTokens > 0
          ? `${formatCompact(yTokens)} ${t`tokens`}`
          : t`Active yesterday`
    : "-";

  const periodTokens = tokens?.recent
    ? compareMonthly
      ? tokens.recent.last30d.tokens
      : tokens.recent.last7d.tokens
    : 0;
  const periodValue = currentPeriod
    ? `${currentPeriod.prompts.toLocaleString()} ${currentPeriod.prompts === 1 ? t`prompt` : t`prompts`}`
    : "-";
  const periodSubParts: string[] = [];
  if (currentPeriod) {
    periodSubParts.push(t`${currentPeriod.activeDays}/${currentPeriod.days} active days`);
    if (avgTurnMs >= 1000) periodSubParts.push(t`avg ${formatDuration(avgTurnMs)}`);
    else if (periodTokens > 0) periodSubParts.push(`${formatCompact(periodTokens)} ${t`tokens`}`);
  }

  const rhythmSource = recent
    ? recent.last30d.prompts >= 10
      ? recent.last30d
      : recent.last7d
    : null;
  const totalWeekdayWeekend = rhythmSource
    ? rhythmSource.weekdayPrompts + rhythmSource.weekendPrompts
    : 0;
  const weekdayPct =
    totalWeekdayWeekend > 0
      ? Math.round((rhythmSource!.weekdayPrompts / totalWeekdayWeekend) * 100)
      : null;
  const topMode = currentPeriod?.modes[0] ?? core.modes[0];
  const rhythmValue = insights.mostActiveHour
    ? t`Peak ${insights.mostActiveHour.label}`
    : topMode
      ? `${topMode.label} · ${Math.round(topMode.percent)}%`
      : "-";
  const rhythmSubParts: string[] = [];
  if (weekdayPct !== null) rhythmSubParts.push(t`${weekdayPct}% Mon–Fri`);
  if (topMode) rhythmSubParts.push(`${topMode.label} ${Math.round(topMode.percent)}%`);
  if (insights.fastModePercent > 0) rhythmSubParts.push(t`${insights.fastModePercent}% fast`);

  const reasoning = insights.topReasoning
    ? `${insights.topReasoning.label} - ${insights.topReasoning.percent}%`
    : "-";
  const provider = insights.topProvider
    ? `${insights.topProvider.label} - ${insights.topProvider.percent}%`
    : "-";
  const activeHour = insights.mostActiveHour ? insights.mostActiveHour.label : "-";
  const tokenRecentPeriod = tokens?.recent
    ? compareMonthly
      ? tokens.recent.last30d
      : tokens.recent.last7d
    : null;
  const cacheDenominator = tokenRecentPeriod
    ? tokenRecentPeriod.inputTokens +
      tokenRecentPeriod.cacheReadTokens +
      tokenRecentPeriod.cacheWriteTokens
    : 0;
  const cachePercent =
    tokenRecentPeriod && cacheDenominator > 0 && tokenRecentPeriod.cacheReadTokens > 0
      ? `${Math.round((tokenRecentPeriod.cacheReadTokens / cacheDenominator) * 100)}%`
      : null;

  const rows: Array<{ label: string; value: string }> = [
    { label: t`Most used provider`, value: provider },
    { label: t`Most used reasoning`, value: reasoning },
    { label: t`Fast mode`, value: `${insights.fastModePercent}%` },
    { label: t`Most active hour`, value: activeHour },
    ...(avgTurnMs >= 1000
      ? [{ label: t`Avg task duration`, value: formatDuration(avgTurnMs) }]
      : []),
    ...(cachePercent ? [{ label: t`Prompt cache hit`, value: cachePercent }] : []),
    { label: t`Messages sent`, value: totals.messagesSent.toLocaleString() },
    { label: t`Goals set`, value: totals.goalsSet.toLocaleString() },
    {
      label: t`Skills explored`,
      value: props.skillsAvailable === false ? "-" : String(insights.skillsExplored),
    },
    { label: t`Skill runs`, value: insights.totalSkillsUsed.toLocaleString() },
    { label: t`Workflow runs`, value: insights.workflowRuns.toLocaleString() },
    { label: t`Subagent runs`, value: insights.subagentRuns.toLocaleString() },
    { label: t`MCP tool calls`, value: insights.mcpToolCalls.toLocaleString() },
    { label: t`Total threads`, value: totals.totalThreads.toLocaleString() },
    { label: t`Total prompts`, value: totals.totalPrompts.toLocaleString() },
  ];
  const midpoint = Math.ceil(rows.length / 2);
  const groups = [
    { key: "primary", rows: rows.slice(0, midpoint) },
    { key: "secondary", rows: rows.slice(midpoint) },
  ];

  return (
    <section className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t`Activity insights`}</h2>
        {facts.length > 0 ? (
          <span className="text-xs text-muted">
            <Plural value={facts.length} one="# highlight" other="# highlights" />
          </span>
        ) : null}
      </div>

      {recent ? (
        <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-3">
          <PulseCard
            label={t`Yesterday`}
            value={yesterdayValue}
            sub={yesterdaySub}
            {...(yTokens > 0
              ? { badge: { label: `${formatCompact(yTokens)} tok`, tone: "neutral" as const } }
              : {})}
          />
          <PulseCard
            label={compareMonthly ? t`Last 30 days` : t`Last 7 days`}
            value={periodValue}
            sub={periodSubParts.join(" · ") || "-"}
            {...(periodDelta !== null
              ? {
                  badge: {
                    label: `${periodDelta >= 0 ? "+" : ""}${periodDelta}%`,
                    tone: periodDelta >= 0 ? ("positive" as const) : ("negative" as const),
                  },
                }
              : {})}
          />
          <PulseCard
            label={t`Work rhythm`}
            value={rhythmValue}
            sub={rhythmSubParts.join(" · ") || "-"}
          />
        </div>
      ) : null}

      {visibleFacts.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] tabular-nums text-muted"
                  data-testid="profile-insights-page"
                  aria-live="polite"
                >
                  {currentPage + 1} / {totalPages}
                </span>
                {totalPages <= 8 ? (
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-200 ${
                          i === currentPage ? "w-4 bg-foreground" : "w-1.5 bg-foreground/20"
                        }`}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  isIconOnly
                  size="sm"
                  variant="secondary"
                  aria-label={t`Previous`}
                  isDisabled={currentPage === 0}
                  onPress={() => goToPage(currentPage - 1)}
                  className="size-7 min-w-0"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="secondary"
                  aria-label={t`Next`}
                  isDisabled={currentPage >= totalPages - 1}
                  onPress={() => goToPage(currentPage + 1)}
                  className="size-7 min-w-0"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-clip">
            <div
              key={currentPage}
              className={`grid grid-cols-1 gap-2.5 @min-[640px]:grid-cols-2 ${slideMotionClass}`}
            >
              {visibleFacts.map((fact) => {
                const rendered = renderInsightFact(fact, {
                  locale: i18n.locale,
                  t,
                  iconClass: "size-3.5 shrink-0 text-warning",
                });
                return (
                  <ContentSurface
                    variant="row"
                    key={fact.id}
                    data-profile-insight={fact.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-muted"
                  >
                    {rendered.icon}
                    <span className="min-w-0 flex-1 leading-snug">{rendered.content}</span>
                    {rendered.badge ? (
                      <Chip
                        size="sm"
                        variant="soft"
                        color={chipColor(rendered.badge.tone)}
                        className="shrink-0"
                      >
                        {rendered.badge.label}
                      </Chip>
                    ) : null}
                  </ContentSurface>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <ContentSurface className="grid grid-cols-1 px-4 py-1 @min-[640px]:grid-cols-2 @min-[640px]:gap-x-8">
        {groups.map((group, index) => (
          <div
            key={group.key}
            className={`divide-y divide-[var(--hairline-soft)] ${
              index > 0 ? "border-t border-[var(--hairline-soft)] @min-[640px]:border-t-0" : ""
            }`}
          >
            {group.rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ))}
      </ContentSurface>
    </section>
  );
}
