import { useState, type ReactNode } from "react";
import { Gauge, Keyboard, Star } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatResetCountdown } from "@poracode/agents-usage/formatters";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentAppVersion, useChangelogStore } from "@/renderer/state/changelogStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { formatCommandShortcut, type PlatformName } from "@/renderer/commands/keybindingMatcher";
import { openUsagePanelForProvider } from "@/renderer/actions/panelActions";
import { USAGE_PROVIDERS } from "@/renderer/components/providers/usageProviders";
import { usageWindowDisplayLabel } from "@/renderer/components/providers/usageFormat";
import { KIND_ICON } from "@/renderer/components/changelog/ChangelogView";
import { GitHubMark, XMark } from "@/renderer/components/common/BrandIcons";
import {
  COMMUNITY_PROMOTION_IDS,
  COMMUNITY_PROMOTION_URLS,
  type CommunityPromotionId,
} from "@/shared/communityLinks";
import {
  changelogHighlightPool,
  highlightHeadline,
  pickChangelogHighlights,
  type ChangelogHighlight,
} from "@/shared/changelogHighlights";
import { pickUsageFact } from "./newsFacts";
import { buildNewsPlaylist, seededRandom, shuffled } from "./newsPlaylist";
import { NEWS_ICON_CLASS, type NewsItem } from "./newsTypes";
import { NEWS_TIPS } from "./newsTips";
import { openNewsUrl, runAppCommand } from "./newsActions";
import { useProfileStats } from "./useProfileStats";
import { useFeatureContext } from "./useFeatureContext";
import { useDiscoveryItems } from "./useDiscoveryItems";
import { useAnnouncementItems } from "./useAnnouncementItems";
import { useInsightItems } from "./useInsightItems";
import { NewsUsageMeter } from "./NewsVisuals";

/** Changelog points and keyboard tips featured per visit. */
const HIGHLIGHTS_PER_VISIT = 3;
const TIPS_PER_VISIT = 2;

function currentPlatform(): PlatformName {
  try {
    return readBridge().platform;
  } catch {
    return "linux";
  }
}

function isPromotionId(id: string): id is CommunityPromotionId {
  return (COMMUNITY_PROMOTION_IDS as readonly string[]).includes(id);
}

const ICON_CLASS = NEWS_ICON_CLASS;

/** One visit's rotation plus the changelog points the expanded card can step through. */
export interface NewsLineModel {
  items: NewsItem[];
  /** Every changelog point in rotation, for stepping through them in the expanded card. */
  highlights: ChangelogHighlight[];
}

/**
 * Builds the news line's rotation for one visit to the new-thread page:
 * activity insights, changelog highlights, remote announcements, features the
 * user has not tried, a usage limit, keyboard tips, and community promotions.
 * Choices are fixed for the visit (seeded once); dismissals and settings apply
 * live.
 */
export function useNewsLineItems(): NewsLineModel {
  const { t } = useLingui();
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32));
  const [historyAtVisit] = useState(() => useNewsLineStore.getState().highlightHistory);
  // Reset countdowns are read once per visit, like the rest of the visit's choices.
  const [visitStartedAt] = useState(() => Date.now());

  const activity = useSharedSettings((state) => state.newsLineActivity);
  const dismissedPromotions = useSharedSettings((state) => state.dismissedPromotions);
  const disabledUsageProviders = useSharedSettings((state) => state.usage.disabledProviders);
  const dismissPromotion = useSharedSettings((state) => state.dismissPromotion);
  const releases = useChangelogStore((state) => state.releases);
  const snapshots = useProviderUsageStore((state) => state.snapshots);
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const hiddenIds = useNewsLineStore((state) => state.hiddenIds);
  const sessionHiddenIds = useNewsLineStore((state) => state.sessionHiddenIds);
  // Stats are read even with activity highlights off: discovery uses them to
  // tell which features were already used. They are only displayed when on.
  const stats = useProfileStats();
  const featureContext = useFeatureContext(stats);

  const hidden = new Set([...hiddenIds, ...sessionHiddenIds]);
  const store = useNewsLineStore.getState;
  const appVersion = currentAppVersion();
  const discovery = useDiscoveryItems({
    seed,
    context: featureContext,
    hidden,
    releases,
    appVersion,
    visitStartedAt,
  });
  const announcements = useAnnouncementItems({
    context: featureContext,
    hidden,
    appVersion,
    visitStartedAt,
  });

  const insights = useInsightItems({ seed, stats: activity ? stats : null, hidden });

  // ── Changelog highlights ────────────────────────────────────────────────
  const pool = changelogHighlightPool(releases, appVersion);
  const poolIds = new Set(pool.map((highlight) => highlight.id));
  const kindLabel = (highlight: ChangelogHighlight): string => {
    const { version } = highlight;
    switch (highlight.change.kind) {
      case "added":
        return t`New in ${version}`;
      case "improved":
        return t`Improved in ${version}`;
      case "fixed":
        return t`Fixed in ${version}`;
    }
  };
  const changelog: NewsItem[] = pickChangelogHighlights(
    pool,
    historyAtVisit,
    HIGHLIGHTS_PER_VISIT,
    seededRandom(seed ^ 0x9e3779b9),
  )
    .filter((highlight) => !hidden.has(`changelog:${highlight.id}`))
    .map((highlight) => {
      const KindIcon = KIND_ICON[highlight.change.kind].icon;
      return {
        id: `changelog:${highlight.id}`,
        kind: "changelog",
        icon: (
          <KindIcon className={`${ICON_CLASS} ${KIND_ICON[highlight.change.kind].className}`} />
        ),
        content: (
          <>
            <span className="mr-1.5 text-muted/80">{kindLabel(highlight)}</span>
            {highlight.change.label ? (
              <span className="mr-1.5 inline-block rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 align-[1px] text-[11px] leading-[17px] text-foreground">
                {highlight.change.label}
              </span>
            ) : null}
            <span>{highlightHeadline(highlight.change)}</span>
          </>
        ),
        highlight,
        action: { label: t`Show me`, onPress: () => undefined },
        onShown: () => store().markHighlightShown(highlight.id, poolIds),
        onDismiss: () => {
          store().retireHighlight(highlight.id);
          store().hideItemForSession(`changelog:${highlight.id}`);
        },
      };
    });

  // ── Usage limit ─────────────────────────────────────────────────────────
  const usageFact = activity
    ? pickUsageFact(
        snapshots,
        disabledUsageProviders,
        (providerId) => USAGE_PROVIDERS.find((provider) => provider.id === providerId)?.label,
      )
    : null;
  const usage: NewsItem[] = [];
  if (usageFact && !hidden.has(usageFact.id)) {
    const percent = Math.round(usageFact.window.usedPercent);
    const windowLabel = usageWindowDisplayLabel(usageFact.window);
    const countdown = formatResetCountdown(usageFact.window.resetsAt, visitStartedAt);
    usage.push({
      id: usageFact.id,
      kind: "usage",
      urgent: usageFact.urgent,
      icon: <Gauge className={`${ICON_CLASS} text-muted`} />,
      content: (
        <>
          <span className="mr-1 text-foreground">{usageFact.providerLabel}</span>
          <span>{windowLabel}</span>
          <NewsUsageMeter usedPercent={usageFact.window.usedPercent} />
          <Trans>{percent}% used</Trans>
          {countdown && countdown !== "now" ? (
            <span className="text-muted/80">
              {" · "}
              <Trans>resets in {countdown}</Trans>
            </span>
          ) : null}
        </>
      ),
      action: {
        label: t`Usage`,
        onPress: () => openUsagePanelForProvider(usageFact.providerId),
      },
      onDismiss: () => store().hideItemForSession(usageFact.id),
    });
  }

  // ── Keyboard tips ───────────────────────────────────────────────────────
  const platform = currentPlatform();
  const tips: NewsItem[] = shuffled(NEWS_TIPS, seededRandom(seed ^ 0x85ebca6b))
    .map((tip) => ({ tip, keys: formatCommandShortcut(tip.commandId, keybindings, platform) }))
    .filter(({ tip, keys }) => keys !== "" && !hidden.has(`tip:${tip.commandId}`))
    .slice(0, TIPS_PER_VISIT)
    .map(({ tip, keys }) => ({
      id: `tip:${tip.commandId}`,
      kind: "tip",
      icon: <Keyboard className={`${ICON_CLASS} text-success`} />,
      content: (
        <>
          <span>{t(tip.message)}</span>
          <kbd className="ml-1.5 inline-block rounded-[5px] border border-b-2 border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 font-sans text-[11px] leading-4 text-foreground">
            {keys}
          </kbd>
        </>
      ),
      action: { label: t`Try it`, onPress: () => runAppCommand(tip.commandId) },
      onDismiss: () => store().hideItem(`tip:${tip.commandId}`),
    }));

  // ── Community promotions ────────────────────────────────────────────────
  const dismissed = new Set(dismissedPromotions.filter(isPromotionId));
  const promotionCopy: Record<
    CommunityPromotionId,
    { icon: ReactNode; text: string; label: string }
  > = {
    "github-star": {
      icon: <GitHubMark className={`${ICON_CLASS} text-foreground`} />,
      text: t`Enjoying Poracode? A star helps others find it`,
      label: t`Star on GitHub`,
    },
    "x-poracode": {
      icon: <XMark className={`${ICON_CLASS} text-foreground`} />,
      text: t`Release notes and tips, first on X`,
      label: t`Follow ${"@poracode"}`,
    },
    "x-creator": {
      icon: <XMark className={`${ICON_CLASS} text-foreground`} />,
      text: t`Behind the scenes from the person building Poracode`,
      label: t`Follow ${"@serg_vecher"}`,
    },
  };
  const promotions: NewsItem[] = shuffled(COMMUNITY_PROMOTION_IDS, seededRandom(seed ^ 0xc2b2ae35))
    .filter((id) => !dismissed.has(id))
    .map((id) => ({
      id: `promotion:${id}`,
      kind: "promotion",
      icon: promotionCopy[id].icon,
      content: <span>{promotionCopy[id].text}</span>,
      action: {
        label: promotionCopy[id].label,
        emphasis: true,
        external: id !== "github-star",
        ...(id === "github-star" ? { leadingIcon: <Star className="size-3" /> } : {}),
        onPress: () => {
          openNewsUrl(COMMUNITY_PROMOTION_URLS[id]);
          dismissPromotion(id);
        },
      },
      onDismiss: () => dismissPromotion(id),
    }));

  return {
    items: buildNewsPlaylist({
      insights,
      changelog,
      announcements,
      discovery,
      usage,
      tips,
      promotions,
    }),
    highlights: pool,
  };
}
