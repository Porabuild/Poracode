import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  Calendar,
  ChartLine,
  Clock,
  Coins,
  Cpu,
  Flame,
  Gauge,
  GitCommitHorizontal,
  Layers,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Timer,
  TrendingDown,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import type { ProfileInsightFact } from "@/shared/profile/insights";
import { formatCompact, formatCost } from "@/renderer/views/ProfileOverlay/format";
import { NewsSparkline } from "./NewsVisuals";

export function weekdayName(dayKey: string, locale: string): string {
  const [year, month, day] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dayKey;
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
    new Date(year, month - 1, day),
  );
}

export function hourName(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
}

export function durationMinutesName(minutes: number, locale: string): string {
  return minutes < 120
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short" }).format(
        minutes,
      )
    : new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "hour",
        unitDisplay: "short",
        maximumFractionDigits: 1,
      }).format(minutes / 60);
}

export function durationSecondsName(seconds: number, locale: string): string {
  if (seconds < 60) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "second",
      unitDisplay: "short",
    }).format(seconds);
  }
  const minutes = Math.round(seconds / 60);
  return durationMinutesName(Math.max(1, minutes), locale);
}

export interface RenderedInsight {
  icon: ReactNode;
  content: ReactNode;
  badge?: {
    label: string;
    tone: "neutral" | "positive" | "negative" | "accent" | "warning";
  };
}

export function renderInsightFact(
  fact: ProfileInsightFact,
  options: {
    locale: string;
    t: TranslateFn;
    iconClass: string;
  },
): RenderedInsight {
  const { locale, t, iconClass } = options;

  switch (fact.id) {
    case "insight:streak": {
      const { current, longest } = fact;
      return {
        icon: <Flame className={iconClass} />,
        badge: { label: t`Streak`, tone: "warning" },
        content:
          current >= longest ? (
            <Trans>
              <Plural value={current} one="# day" other="# days" /> in a row · your best streak yet
            </Trans>
          ) : (
            <Trans>
              <Plural value={current} one="# day" other="# days" /> in a row · your best is{" "}
              {longest}
            </Trans>
          ),
      };
    }

    case "insight:week-prompts": {
      const { prompts, daily, busiestDay } = fact;
      const weekday = busiestDay ? weekdayName(busiestDay, locale) : null;
      return {
        icon: <ChartLine className={iconClass} />,
        badge: { label: t`7d`, tone: "neutral" },
        content: (
          <>
            {weekday ? (
              <Trans>
                <Plural value={prompts} one="# prompt" other="# prompts" /> this week · busiest on{" "}
                {weekday}
              </Trans>
            ) : (
              <Trans>
                <Plural value={prompts} one="# prompt" other="# prompts" /> this week
              </Trans>
            )}
            <NewsSparkline values={daily} />
          </>
        ),
      };
    }

    case "insight:top-model": {
      const { label, percent } = fact;
      return {
        icon: <Cpu className={iconClass} />,
        badge: { label: `${percent}%`, tone: "neutral" },
        content: (
          <Trans>
            <strong className="font-medium text-foreground">{label}</strong> handles {percent}% of
            your prompts
          </Trans>
        ),
      };
    }

    case "insight:active-hour": {
      const hourLabel = hourName(fact.hour, locale);
      return {
        icon: <Clock className={iconClass} />,
        badge: { label: hourLabel, tone: "neutral" },
        content: <Trans>You're most active around {hourLabel}</Trans>,
      };
    }

    case "insight:longest-task": {
      const duration = durationMinutesName(fact.minutes, locale);
      return {
        icon: <Timer className={iconClass} />,
        badge: { label: duration, tone: "neutral" },
        content: <Trans>Your longest task ran {duration}</Trans>,
      };
    }

    case "insight:provider-switch": {
      const { fromLabel, toLabel, toPercent } = fact;
      return {
        icon: <ArrowLeftRight className={iconClass} />,
        badge: { label: t`Switch`, tone: "accent" },
        content: (
          <Trans>
            This week you switched from{" "}
            <strong className="font-medium text-foreground">{fromLabel}</strong> to{" "}
            <strong className="font-medium text-foreground">{toLabel}</strong> ({toPercent}%)
          </Trans>
        ),
      };
    }

    case "insight:model-switch": {
      const { fromLabel, toLabel } = fact;
      return {
        icon: <ArrowLeftRight className={iconClass} />,
        badge: { label: t`Switch`, tone: "accent" },
        content: (
          <Trans>
            This week you switched from{" "}
            <strong className="font-medium text-foreground">{fromLabel}</strong> to{" "}
            <strong className="font-medium text-foreground">{toLabel}</strong>
          </Trans>
        ),
      };
    }

    case "insight:week-velocity": {
      const { direction, percent, current, previous } = fact;
      return {
        icon:
          direction === "up" ? (
            <TrendingUp className={iconClass} />
          ) : (
            <TrendingDown className={iconClass} />
          ),
        badge: {
          label: `${direction === "up" ? "+" : "-"}${percent}%`,
          tone: direction === "up" ? "positive" : "negative",
        },
        content:
          direction === "up" ? (
            <Trans>
              Activity is up {percent}% this week · {current} vs {previous} prompts
            </Trans>
          ) : (
            <Trans>
              Activity is down {percent}% this week · {current} vs {previous} prompts
            </Trans>
          ),
      };
    }

    case "insight:month-velocity": {
      const { direction, percent } = fact;
      return {
        icon:
          direction === "up" ? (
            <TrendingUp className={iconClass} />
          ) : (
            <TrendingDown className={iconClass} />
          ),
        badge: {
          label: `${direction === "up" ? "+" : "-"}${percent}%`,
          tone: direction === "up" ? "positive" : "negative",
        },
        content:
          direction === "up" ? (
            <Trans>Prompts rose {percent}% over the last 30 days</Trans>
          ) : (
            <Trans>Prompts dipped {percent}% over the last 30 days</Trans>
          ),
      };
    }

    case "insight:week-active-days": {
      const { activeDays, totalDays } = fact;
      return {
        icon: <Calendar className={iconClass} />,
        badge: { label: `${activeDays}/${totalDays}`, tone: "positive" },
        content: (
          <Trans>
            Active {activeDays} of the last {totalDays} days
          </Trans>
        ),
      };
    }

    case "insight:tokens-trend": {
      const { direction, percent, tokens } = fact;
      const compact = formatCompact(tokens);
      return {
        icon:
          direction === "up" ? (
            <TrendingUp className={iconClass} />
          ) : (
            <TrendingDown className={iconClass} />
          ),
        badge: {
          label: `${direction === "up" ? "+" : "-"}${percent}%`,
          tone: direction === "up" ? "positive" : "neutral",
        },
        content:
          direction === "up" ? (
            <Trans>
              Token usage is up {percent}% this week ({compact})
            </Trans>
          ) : (
            <Trans>
              Token usage is down {percent}% this week ({compact})
            </Trans>
          ),
      };
    }

    case "insight:weekly-cost": {
      const cost = formatCost(fact.estimatedUsd, "USD", locale);
      return {
        icon: <Coins className={iconClass} />,
        badge: { label: cost, tone: "neutral" },
        content: <Trans>This week's usage equals ~{cost} at API rates</Trans>,
      };
    }

    case "insight:cache-efficiency": {
      const { percent } = fact;
      return {
        icon: <Zap className={iconClass} />,
        badge: { label: `${percent}%`, tone: "positive" },
        content: <Trans>Prompt caching covered {percent}% of your input tokens this week</Trans>,
      };
    }

    case "insight:yesterday-summary": {
      const { prompts, topProvider, topProviderPercent, tokens } = fact;
      const compactTokens = tokens ? formatCompact(tokens) : null;
      return {
        icon: <Activity className={iconClass} />,
        badge: { label: t`Yesterday`, tone: "accent" },
        content:
          topProvider && topProviderPercent !== undefined ? (
            <Trans>
              Yesterday: <Plural value={prompts} one="# prompt" other="# prompts" /> · led by{" "}
              {topProvider} ({topProviderPercent}%)
            </Trans>
          ) : compactTokens ? (
            <Trans>
              Yesterday: <Plural value={prompts} one="# prompt" other="# prompts" /> ·{" "}
              {compactTokens} tokens
            </Trans>
          ) : (
            <Trans>
              Yesterday: <Plural value={prompts} one="# prompt" other="# prompts" />
            </Trans>
          ),
      };
    }

    case "insight:yesterday-spike": {
      const { prompts, multiplier } = fact;
      return {
        icon: <Flame className={iconClass} />,
        badge: { label: `${multiplier}x`, tone: "warning" },
        content: (
          <Trans>
            Busy day yesterday · {prompts} prompts ({multiplier}x your daily average)
          </Trans>
        ),
      };
    }

    case "insight:yesterday-model": {
      const { model, percent } = fact;
      return {
        icon: <Cpu className={iconClass} />,
        badge: { label: t`Yesterday`, tone: "neutral" },
        content: (
          <Trans>
            Yesterday <strong className="font-medium text-foreground">{model}</strong> handled{" "}
            {percent}% of your prompts
          </Trans>
        ),
      };
    }

    case "insight:yesterday-tokens": {
      const compact = formatCompact(fact.tokens);
      const cost = fact.estimatedUsd >= 0.1 ? formatCost(fact.estimatedUsd, "USD", locale) : null;
      return {
        icon: <Coins className={iconClass} />,
        badge: { label: compact, tone: "neutral" },
        content: cost ? (
          <Trans>
            Yesterday you used {compact} tokens (~{cost})
          </Trans>
        ) : (
          <Trans>Yesterday you used {compact} tokens</Trans>
        ),
      };
    }

    case "insight:yesterday-longest-task": {
      const duration = durationMinutesName(fact.minutes, locale);
      return {
        icon: <Timer className={iconClass} />,
        badge: { label: t`Yesterday`, tone: "neutral" },
        content: <Trans>Your longest task yesterday ran {duration}</Trans>,
      };
    }

    case "insight:today-momentum": {
      const { prompts, topProvider } = fact;
      return {
        icon: <Activity className={iconClass} />,
        badge: { label: t`Today`, tone: "positive" },
        content: topProvider ? (
          <Trans>
            So far today: <Plural value={prompts} one="# prompt" other="# prompts" /> · mostly{" "}
            {topProvider}
          </Trans>
        ) : (
          <Trans>
            So far today: <Plural value={prompts} one="# prompt" other="# prompts" />
          </Trans>
        ),
      };
    }

    case "insight:chronotype": {
      const { slot, percent } = fact;
      if (slot === "night") {
        return {
          icon: <Moon className={iconClass} />,
          badge: { label: `${percent}%`, tone: "neutral" },
          content: <Trans>Night owl: {percent}% of your recent prompts ran after 10 PM</Trans>,
        };
      }
      if (slot === "early") {
        return {
          icon: <Sun className={iconClass} />,
          badge: { label: `${percent}%`, tone: "neutral" },
          content: (
            <Trans>Early bird: {percent}% of your recent prompts started before 10 AM</Trans>
          ),
        };
      }
      return {
        icon: <Clock className={iconClass} />,
        badge: { label: `${percent}%`, tone: "neutral" },
        content: <Trans>Evening builder: {percent}% of your recent prompts ran 6–10 PM</Trans>,
      };
    }

    case "insight:hour-shift": {
      const fromLabel = hourName(fact.fromHour, locale);
      const toLabel = hourName(fact.toHour, locale);
      return {
        icon: <Clock className={iconClass} />,
        badge: { label: t`Shift`, tone: "accent" },
        content: (
          <Trans>
            Your peak coding hour shifted from {fromLabel} to {toLabel} this week
          </Trans>
        ),
      };
    }

    case "insight:weekend-rhythm": {
      const { focus, percent } = fact;
      return {
        icon: <Calendar className={iconClass} />,
        badge: { label: `${percent}%`, tone: "neutral" },
        content:
          focus === "weekend" ? (
            <Trans>Weekend builder: {percent}% of your recent prompts ran on weekends</Trans>
          ) : (
            <Trans>Weekday steady: {percent}% of your recent prompts ran Mon–Fri</Trans>
          ),
      };
    }

    case "insight:mode-behavior": {
      const { modeLabel, percent, prevPercent } = fact;
      return {
        icon: <Layers className={iconClass} />,
        badge: { label: `${percent}%`, tone: "neutral" },
        content:
          prevPercent !== undefined ? (
            <Trans>
              You leaned into {modeLabel} mode this week ({percent}% vs {prevPercent}%)
            </Trans>
          ) : (
            <Trans>
              {percent}% of your threads this week used {modeLabel} mode
            </Trans>
          ),
      };
    }

    case "insight:fast-mode": {
      const { percent, prevPercent } = fact;
      return {
        icon: <Zap className={iconClass} />,
        badge: { label: `${percent}%`, tone: "warning" },
        content:
          prevPercent !== undefined ? (
            <Trans>
              Fast mode ran on {percent}% of turns this week (was {prevPercent}%)
            </Trans>
          ) : (
            <Trans>Fast mode powered {percent}% of your turns this week</Trans>
          ),
      };
    }

    case "insight:reasoning-habit": {
      const { effort, percent } = fact;
      return {
        icon: <Gauge className={iconClass} />,
        badge: { label: effort, tone: "neutral" },
        content: (
          <Trans>
            You ran {percent}% of turns with {effort} reasoning this week
          </Trans>
        ),
      };
    }

    case "insight:turn-pace": {
      const duration = durationSecondsName(fact.avgSeconds, locale);
      const { direction, deltaPercent } = fact;
      return {
        icon: <Timer className={iconClass} />,
        badge:
          direction && deltaPercent
            ? {
                label: `${direction === "up" ? "+" : "-"}${deltaPercent}%`,
                tone: "neutral",
              }
            : { label: duration, tone: "neutral" },
        content:
          direction === "up" && deltaPercent ? (
            <Trans>
              Tasks averaged {duration} this week · {deltaPercent}% longer than last week
            </Trans>
          ) : direction === "down" && deltaPercent ? (
            <Trans>
              Tasks averaged {duration} this week · {deltaPercent}% faster than last week
            </Trans>
          ) : (
            <Trans>Tasks averaged {duration} this week</Trans>
          ),
      };
    }

    case "insight:week-top-skill": {
      const { name, count } = fact;
      return {
        icon: <Sparkles className={iconClass} />,
        badge: { label: t`Skill`, tone: "accent" },
        content: (
          <Trans>
            Top skill this week: <strong className="font-medium text-foreground">{name}</strong> (
            <Plural value={count} one="# run" other="# runs" />)
          </Trans>
        ),
      };
    }

    case "insight:week-top-mcp": {
      const { name, count } = fact;
      return {
        icon: <Wrench className={iconClass} />,
        badge: { label: t`MCP`, tone: "accent" },
        content: (
          <Trans>
            Most-used MCP this week: <strong className="font-medium text-foreground">{name}</strong>{" "}
            (<Plural value={count} one="# call" other="# calls" />)
          </Trans>
        ),
      };
    }

    case "insight:week-subagents": {
      const { count, direction, deltaPercent } = fact;
      return {
        icon: <Layers className={iconClass} />,
        badge:
          direction && deltaPercent
            ? {
                label: `${direction === "up" ? "+" : "-"}${deltaPercent}%`,
                tone: direction === "up" ? "positive" : "neutral",
              }
            : { label: String(count), tone: "neutral" },
        content:
          direction === "up" && deltaPercent ? (
            <Trans>
              <Plural value={count} one="# subagent run" other="# subagent runs" /> this week (+
              {deltaPercent}%)
            </Trans>
          ) : direction === "down" && deltaPercent ? (
            <Trans>
              <Plural value={count} one="# subagent run" other="# subagent runs" /> this week (-
              {deltaPercent}%)
            </Trans>
          ) : (
            <Trans>
              <Plural value={count} one="# subagent run" other="# subagent runs" /> this week
            </Trans>
          ),
      };
    }

    case "insight:week-workflows": {
      const { count } = fact;
      return {
        icon: <Layers className={iconClass} />,
        badge: { label: String(count), tone: "neutral" },
        content: (
          <Trans>
            <Plural value={count} one="# workflow run" other="# workflow runs" /> this week
          </Trans>
        ),
      };
    }

    case "insight:week-ai-git": {
      const { commits, prs, conflicts } = fact;
      const parts: string[] = [];
      if (commits > 0) parts.push(t(msg`${commits} commits`));
      if (prs > 0) parts.push(t(msg`${prs} PRs`));
      if (conflicts > 0) parts.push(t(msg`${conflicts} conflicts`));
      const summary = parts.join(", ");
      return {
        icon: <GitCommitHorizontal className={iconClass} />,
        badge: { label: t`Git`, tone: "positive" },
        content: <Trans>Agents shipped {summary} this week</Trans>,
      };
    }

    case "insight:envs-active": {
      const { count, period } = fact;
      return {
        icon: <Monitor className={iconClass} />,
        badge: { label: t`Multi-env`, tone: "accent" },
        content:
          period === "yesterday" ? (
            <Trans>You coded across {count} connected environments yesterday</Trans>
          ) : (
            <Trans>You coded across {count} connected environments this week</Trans>
          ),
      };
    }

    case "insight:env-top": {
      const { envLabel, percent } = fact;
      return {
        icon: <Monitor className={iconClass} />,
        badge: { label: `${percent}%`, tone: "neutral" },
        content: (
          <Trans>
            <strong className="font-medium text-foreground">{envLabel}</strong> ran {percent}% of
            your prompts this week
          </Trans>
        ),
      };
    }

    case "insight:env-specialization": {
      const { envA, providerA, envB, providerB } = fact;
      return {
        icon: <Monitor className={iconClass} />,
        badge: { label: t`Multi-env`, tone: "accent" },
        content: (
          <Trans>
            <strong className="font-medium text-foreground">{envA}</strong> leaned {providerA} while{" "}
            <strong className="font-medium text-foreground">{envB}</strong> leaned {providerB} this
            week
          </Trans>
        ),
      };
    }

    case "insight:total-milestone": {
      const promptsText = fact.totalPrompts.toLocaleString(locale);
      const threadsText = fact.totalThreads.toLocaleString(locale);
      return {
        icon: <Flame className={iconClass} />,
        badge: { label: promptsText, tone: "neutral" },
        content: (
          <Trans>
            {promptsText} total prompts across {threadsText} threads
          </Trans>
        ),
      };
    }

    default: {
      if (fact.id.startsWith("insight:new-model:")) {
        const f = fact as Extract<ProfileInsightFact, { id: `insight:new-model:${string}` }>;
        return {
          icon: <Sparkles className={iconClass} />,
          badge: { label: t`New`, tone: "accent" },
          content: (
            <Trans>
              You started using <strong className="font-medium text-foreground">{f.model}</strong>{" "}
              this week · <Plural value={f.prompts} one="# prompt" other="# prompts" />
            </Trans>
          ),
        };
      }
      if (fact.id.startsWith("insight:provider-delta:")) {
        const f = fact as Extract<ProfileInsightFact, { id: `insight:provider-delta:${string}` }>;
        return {
          icon:
            f.direction === "up" ? (
              <TrendingUp className={iconClass} />
            ) : (
              <TrendingDown className={iconClass} />
            ),
          badge: {
            label: `${f.direction === "up" ? "+" : "-"}${f.percent}%`,
            tone: f.direction === "up" ? "positive" : "negative",
          },
          content:
            f.period === "7d" ? (
              f.direction === "down" ? (
                <Trans>
                  This week you used{" "}
                  <strong className="font-medium text-foreground">{f.provider}</strong> {f.percent}%
                  less
                </Trans>
              ) : (
                <Trans>
                  This week you used{" "}
                  <strong className="font-medium text-foreground">{f.provider}</strong> {f.percent}%
                  more
                </Trans>
              )
            ) : f.direction === "down" ? (
              <Trans>
                Over the last 30 days you used{" "}
                <strong className="font-medium text-foreground">{f.provider}</strong> {f.percent}%
                less
              </Trans>
            ) : (
              <Trans>
                Over the last 30 days you used{" "}
                <strong className="font-medium text-foreground">{f.provider}</strong> {f.percent}%
                more
              </Trans>
            ),
        };
      }
      if (fact.id.startsWith("insight:model-delta:")) {
        const f = fact as Extract<ProfileInsightFact, { id: `insight:model-delta:${string}` }>;
        return {
          icon:
            f.direction === "up" ? (
              <TrendingUp className={iconClass} />
            ) : (
              <TrendingDown className={iconClass} />
            ),
          badge: {
            label: `${f.direction === "up" ? "+" : "-"}${f.percent}%`,
            tone: f.direction === "up" ? "positive" : "negative",
          },
          content:
            f.direction === "down" ? (
              <Trans>
                This week you ran <strong className="font-medium text-foreground">{f.model}</strong>{" "}
                {f.percent}% less
              </Trans>
            ) : (
              <Trans>
                This week you ran <strong className="font-medium text-foreground">{f.model}</strong>{" "}
                {f.percent}% more
              </Trans>
            ),
        };
      }
      const f = fact as Extract<ProfileInsightFact, { id: `insight:env-surge:${string}` }>;
      return {
        icon: <Monitor className={iconClass} />,
        badge: { label: `+${f.percent}%`, tone: "positive" },
        content: (
          <Trans>
            Activity on <strong className="font-medium text-foreground">{f.envLabel}</strong> jumped{" "}
            {f.percent}% this week
          </Trans>
        ),
      };
    }
  }
}
