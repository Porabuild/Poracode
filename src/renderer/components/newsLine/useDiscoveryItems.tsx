import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { ChangelogRelease } from "@/shared/changelog";
import { highlightHeadline } from "@/shared/changelogHighlights";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import { FEATURE_CATALOG, type FeatureContext } from "./featureCatalog";
import { newFeaturesFromChangelog, pickDiscoveries } from "./featureDiscoveryPicks";
import { seededRandom } from "./newsPlaylist";
import { NEWS_ICON_CLASS, type NewsItem } from "./newsTypes";

/** Features suggested per visit. */
const DISCOVERIES_PER_VISIT = 2;
const ICON_CLASS = `${NEWS_ICON_CLASS} text-accent`;

/**
 * "Not tried yet" suggestions from the feature catalog. Features introduced by
 * a recent release note (`feature` on a changelog change) lead, using that
 * note's headline. Choices are fixed for the visit; using or closing a
 * feature removes it live.
 */
export function useDiscoveryItems(options: {
  seed: number;
  context: FeatureContext;
  hidden: ReadonlySet<string>;
  releases: readonly ChangelogRelease[];
  appVersion: string;
  visitStartedAt: number;
}): NewsItem[] {
  const { t } = useLingui();
  const { seed, context, hidden, releases, appVersion, visitStartedAt } = options;
  const [historyAtVisit] = useState(() => useNewsLineStore.getState().discoveryHistory);
  const store = useNewsLineStore.getState;

  const picks = pickDiscoveries(FEATURE_CATALOG, context, {
    history: historyAtVisit,
    hidden,
    newFeatures: newFeaturesFromChangelog(releases, appVersion, visitStartedAt),
    now: visitStartedAt,
    count: DISCOVERIES_PER_VISIT,
    random: seededRandom(seed ^ 0x27d4eb2f),
  });

  return picks.map(({ feature, newIn }) => {
    const Icon = feature.icon;
    const { version } = newIn ?? { version: "" };
    return {
      id: `discover:${feature.id}`,
      kind: "discovery",
      icon: <Icon className={ICON_CLASS} />,
      content: newIn ? (
        <>
          <span className="mr-1.5 text-muted/80">{t`New in ${version}`}</span>
          <span>{highlightHeadline(newIn.change)}</span>
        </>
      ) : (
        <span>{t(feature.pitch)}</span>
      ),
      action: {
        label: t(feature.action),
        onPress: () => {
          store().hideItem(`discover:${feature.id}`);
          feature.open();
        },
      },
      onShown: () => store().markDiscoveryShown(feature.id),
      onDismiss: () => store().hideItem(`discover:${feature.id}`),
    };
  });
}
