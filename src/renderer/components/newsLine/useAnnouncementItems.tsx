import { useEffect } from "react";
import { HeartHandshake, Megaphone, Star } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { i18n } from "@/renderer/i18n/i18n";
import { useChangelogStore } from "@/renderer/state/changelogStore";
import { useNewsFeedStore } from "@/renderer/state/newsFeedStore";
import { useNewsLineStore } from "@/renderer/state/newsLineStore";
import {
  selectNewsFeedItems,
  type NewsFeedTemplate,
  type NewsPlatform,
  type SelectedNewsItem,
} from "@/shared/newsFeed";
import { findFeature, type FeatureContext } from "./featureCatalog";
import { NEWS_ICON_CLASS, type NewsAction, type NewsItem } from "./newsTypes";
import { openNewsUrl } from "./newsActions";

/** Remote items featured per visit. */
const ANNOUNCEMENTS_PER_VISIT = 3;
const ICON_CLASS = NEWS_ICON_CLASS;

function currentNewsPlatform(): NewsPlatform {
  try {
    if (isBrowserClientRuntime()) return "web";
    const platform = readBridge().platform;
    return platform === "darwin" || platform === "win32" ? platform : "linux";
  } catch {
    return "web";
  }
}

function TemplateText(props: { template: NewsFeedTemplate }) {
  const count = props.template.count.toLocaleString(i18n.locale);
  switch (props.template.name) {
    case "github-stars-milestone":
      return <Trans>Poracode just passed {count} stars on GitHub</Trans>;
    case "good-first-issues": {
      const issues = props.template.count;
      return (
        <Trans>
          <Plural value={issues} one="# good first issue is" other="# good first issues are" />{" "}
          open. Want to contribute?
        </Trans>
      );
    }
  }
}

/**
 * Items from the remote news feed (`https://poracode.com/news.json`). The
 * feed is refreshed when the news line mounts (at most every few hours) and
 * filtered by `selectNewsFeedItems`. Opening or closing an item hides it on
 * this device.
 */
export function useAnnouncementItems(options: {
  context: FeatureContext;
  hidden: ReadonlySet<string>;
  appVersion: string;
  visitStartedAt: number;
}): NewsItem[] {
  const { t } = useLingui();
  const { context, hidden, appVersion, visitStartedAt } = options;
  const feed = useNewsFeedStore((state) => state.feed);
  const store = useNewsLineStore.getState;

  useEffect(() => {
    void useNewsFeedStore.getState().refresh();
  }, []);

  const selected = selectNewsFeedItems(feed, {
    now: visitStartedAt,
    appVersion,
    platform: currentNewsPlatform(),
    locale: i18n.locale,
    isFeatureUsed: (id) => {
      const feature = findFeature(id);
      return feature ? feature.isUsed(context) : undefined;
    },
  })
    .filter((item) => !hidden.has(`remote:${item.id}`))
    .slice(0, ANNOUNCEMENTS_PER_VISIT);

  const actionFor = (item: SelectedNewsItem): NewsAction | undefined => {
    const hide = () => store().hideItem(`remote:${item.id}`);
    const action = item.action;
    if (!action) return undefined;
    switch (action.type) {
      case "url":
        return {
          label: item.actionLabel ?? t`Open`,
          external: true,
          onPress: () => {
            openNewsUrl(action.url);
            hide();
          },
        };
      case "whats-new":
        return {
          label: t`What's New`,
          onPress: () => {
            useChangelogStore.getState().openWhatsNew();
            hide();
          },
        };
      case "feature": {
        const feature = findFeature(action.feature);
        if (!feature) return undefined;
        return {
          label: t(feature.action),
          onPress: () => {
            hide();
            feature.open();
          },
        };
      }
    }
  };

  return selected.map((item) => {
    const action = actionFor(item);
    const icon =
      "template" in item.content && item.content.template.name === "github-stars-milestone" ? (
        <Star className={`${ICON_CLASS} text-warning`} />
      ) : item.kind === "community" ? (
        <HeartHandshake className={`${ICON_CLASS} text-success`} />
      ) : (
        <Megaphone className={`${ICON_CLASS} text-accent`} />
      );
    return {
      id: `remote:${item.id}`,
      kind: "announcement",
      icon,
      content:
        "text" in item.content ? (
          <span>{item.content.text}</span>
        ) : (
          <TemplateText template={item.content.template} />
        ),
      ...(action ? { action } : {}),
      onDismiss: () => store().hideItem(`remote:${item.id}`),
    };
  });
}
