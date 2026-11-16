import { useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats, ProfileTokenStats } from "@/shared/contracts";
import type { ProfileEnvSummary } from "@/shared/profile/insights";
import { i18n } from "@/renderer/i18n/i18n";
import { openProfileSettings } from "@/renderer/actions/panelActions";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import { renderInsightFact } from "./insightContent";
import { buildProfileInsightFacts } from "./newsFacts";
import { seededRandom, shuffled } from "./newsPlaylist";
import { NEWS_ICON_CLASS, type NewsItem } from "./newsTypes";

/** Personal activity, trend, behavior, and cross-env highlights, randomized per visit. */
export function useInsightItems(options: {
  seed: number;
  stats: ProfileCoreStats | null;
  tokens?: ProfileTokenStats | null;
  envs?: readonly ProfileEnvSummary[];
  hidden: ReadonlySet<string>;
}): NewsItem[] {
  const { t } = useLingui();
  const { seed, stats, tokens, envs, hidden } = options;
  const locale = i18n.locale;
  const store = useNewsLineStore.getState;
  const ICON_CLASS = `${NEWS_ICON_CLASS} text-warning`;

  const facts = buildProfileInsightFacts({
    core: stats,
    ...(tokens !== undefined ? { tokens } : {}),
    ...(envs !== undefined ? { envs } : {}),
  });

  // Shuffle so every visit surfaces unexpected variety while preserving relative
  // priority bias for the batch planner.
  return shuffled(facts, seededRandom(seed))
    .filter((fact) => !hidden.has(fact.id))
    .map((fact) => {
      const rendered = renderInsightFact(fact, { locale, t, iconClass: ICON_CLASS });
      return {
        id: fact.id,
        kind: "insight",
        category: fact.category,
        subject: fact.subject,
        weight: Math.max(0.6, Math.min(2, fact.priority / 55)),
        icon: rendered.icon,
        content: rendered.content,
        action: { label: t`View profile`, onPress: openProfileSettings },
        onDismiss: () => store().hideItem(fact.id),
      };
    });
}
