import type { ReactNode } from "react";
import { ChartLine, Clock, Cpu, Flame, Timer } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { openProfileSettings } from "@/renderer/actions/panelActions";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import { buildInsightFacts, type InsightFact } from "./newsFacts";
import { seededRandom, shuffled } from "./newsPlaylist";
import { NEWS_ICON_CLASS, type NewsItem } from "./newsTypes";
import { NewsSparkline } from "./NewsVisuals";

function weekdayName(dayKey: string, locale: string): string {
  const [year, month, day] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dayKey;
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
    new Date(year, month - 1, day),
  );
}

function hourName(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
}

function durationName(minutes: number, locale: string): string {
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

/** Personal activity highlights from the host's profile stats, shuffled per visit. */
export function useInsightItems(options: {
  seed: number;
  stats: ProfileCoreStats | null;
  hidden: ReadonlySet<string>;
}): NewsItem[] {
  const { t } = useLingui();
  const { seed, stats, hidden } = options;
  const locale = i18n.locale;
  const store = useNewsLineStore.getState;
  const ICON_CLASS = `${NEWS_ICON_CLASS} text-warning`;

  const insightContent = (fact: InsightFact): { icon: ReactNode; content: ReactNode } => {
    switch (fact.id) {
      case "insight:streak": {
        const { current, longest } = fact;
        return {
          icon: <Flame className={`${ICON_CLASS}`} />,
          content:
            current >= longest ? (
              <Trans>
                <Plural value={current} one="# day" other="# days" /> in a row · your best streak
                yet
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
          icon: <ChartLine className={`${ICON_CLASS}`} />,
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
          icon: <Cpu className={`${ICON_CLASS}`} />,
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
          icon: <Clock className={`${ICON_CLASS}`} />,
          content: <Trans>You're most active around {hourLabel}</Trans>,
        };
      }
      case "insight:longest-task": {
        const duration = durationName(fact.minutes, locale);
        return {
          icon: <Timer className={`${ICON_CLASS}`} />,
          content: <Trans>Your longest task ran {duration}</Trans>,
        };
      }
    }
  };

  return shuffled(buildInsightFacts(stats), seededRandom(seed))
    .filter((fact) => !hidden.has(fact.id))
    .map((fact) => ({
      id: fact.id,
      kind: "insight",
      ...insightContent(fact),
      action: { label: t`View profile`, onPress: openProfileSettings },
      onDismiss: () => store().hideItem(fact.id),
    }));
}
