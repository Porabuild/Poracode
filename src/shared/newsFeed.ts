import { z } from "zod";
import { compareVersions } from "./changelog";
import { isDiscoverableFeatureId, type DiscoverableFeatureId } from "./featureDiscovery";

/**
 * Remote news feed for the new-thread news line, served by the website at
 * https://poracode.com/news.json. It combines hand-written announcements
 * (`website/src/lib/news/items.json`) with items the website derives from
 * public GitHub data, so new content ships without an app release.
 *
 * The feed is untrusted data. It never carries markup or code: text is plain,
 * links are HTTPS on an allowlist, and in-app actions can only open a feature
 * from the app's own discovery catalog or What's New. Items are validated one
 * by one, so a single bad item never hides the rest. Unknown fields, kinds,
 * templates, and feature ids are ignored, which keeps older apps compatible
 * with newer feeds. Bump {@link NEWS_FEED_VERSION} only for a breaking change;
 * apps ignore a feed whose version they do not support.
 */
export const NEWS_FEED_URL = "https://poracode.com/news.json";
export const NEWS_FEED_VERSION = 1;

/** Hosts a feed link may open. GitHub links must stay inside the Porabuild org. */
export const NEWS_LINK_HOSTS = ["poracode.com", "www.poracode.com", "x.com", "github.com"] as const;
export const NEWS_TEXT_MAX = 140;
export const NEWS_LABEL_MAX = 32;
export const NEWS_FEED_MAX_ITEMS = 50;

const NEWS_ITEM_KINDS = ["announcement", "community"] as const;
export type NewsItemKindRemote = (typeof NEWS_ITEM_KINDS)[number];
const NEWS_PLATFORMS = ["darwin", "win32", "linux", "web"] as const;
export type NewsPlatform = (typeof NEWS_PLATFORMS)[number];

const localizedText = (max: number) =>
  z.record(z.string(), z.string()).transform((map, ctx) => {
    const clean: Record<string, string> = {};
    for (const [locale, value] of Object.entries(map)) {
      // Plain text only: drop control characters and collapse whitespace.
      const text = value
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 0 && text.length <= max) clean[locale.toLowerCase()] = text;
    }
    if (!clean.en) {
      ctx.addIssue({ code: "custom", message: "English text is required" });
      return z.NEVER;
    }
    return clean;
  });

export function isAllowedNewsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (!(NEWS_LINK_HOSTS as readonly string[]).includes(url.hostname)) return false;
    if (url.hostname === "github.com" && !url.pathname.toLowerCase().startsWith("/porabuild/"))
      return false;
    return true;
  } catch {
    return false;
  }
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.string().refine(isAllowedNewsUrl, "URL is not on the news allowlist"),
    label: localizedText(NEWS_LABEL_MAX).optional(),
  }),
  z.object({
    type: z.literal("feature"),
    feature: z.string().refine(isDiscoverableFeatureId, "Unknown feature"),
  }),
  z.object({ type: z.literal("whats-new") }),
]);
export type NewsFeedAction = z.infer<typeof actionSchema>;

/** Built-in sentences the app localizes itself; params are numbers only. */
const templateSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("github-stars-milestone"), count: z.number().int().positive() }),
  z.object({ name: z.literal("good-first-issues"), count: z.number().int().positive() }),
]);
export type NewsFeedTemplate = z.infer<typeof templateSchema>;

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const itemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
    kind: z.enum(NEWS_ITEM_KINDS),
    text: localizedText(NEWS_TEXT_MAX).optional(),
    template: templateSchema.optional(),
    action: actionSchema.optional(),
    start: isoDate.optional(),
    end: isoDate.optional(),
    minAppVersion: z.string().optional(),
    maxAppVersion: z.string().optional(),
    platforms: z.array(z.enum(NEWS_PLATFORMS)).optional(),
    unlessUsed: z.array(z.string()).optional(),
    onlyIfUsed: z.array(z.string()).optional(),
    weight: z.number().int().min(1).max(5).optional(),
  })
  .refine((item) => (item.text ? !item.template : Boolean(item.template)), {
    message: "Exactly one of text or template is required",
  });
export type NewsFeedItem = z.infer<typeof itemSchema>;

export interface NewsFeed {
  paused: boolean;
  items: NewsFeedItem[];
}

const envelopeSchema = z.object({
  version: z.number().int(),
  paused: z.boolean().optional(),
  items: z.array(z.unknown()),
});

/**
 * Validate an untrusted feed. Returns null for an unusable envelope (wrong
 * shape or a future version); invalid items are dropped individually.
 */
export function parseNewsFeed(raw: unknown): NewsFeed | null {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success || envelope.data.version !== NEWS_FEED_VERSION) return null;
  const items: NewsFeedItem[] = [];
  const seen = new Set<string>();
  for (const candidate of envelope.data.items.slice(0, NEWS_FEED_MAX_ITEMS)) {
    const item = itemSchema.safeParse(candidate);
    if (!item.success || seen.has(item.data.id)) continue;
    seen.add(item.data.id);
    items.push(item.data);
  }
  return { paused: envelope.data.paused === true, items };
}

export interface NewsFeedContext {
  now: number;
  appVersion: string;
  platform: NewsPlatform;
  locale: string;
  /** Whether the user has used a discovery feature; undefined when unknown. */
  isFeatureUsed: (feature: DiscoverableFeatureId) => boolean | undefined;
}

export interface SelectedNewsItem {
  id: string;
  kind: NewsItemKindRemote;
  weight: number;
  /** Resolved plain text for the user's locale, or a template to localize. */
  content: { text: string } | { template: NewsFeedTemplate };
  action?: NewsFeedAction;
  /** Resolved action label for `url` actions that provide one. */
  actionLabel?: string;
}

/** Exact locale, then its language, then English. */
export function pickLocalized(map: Record<string, string>, locale: string): string {
  const normalized = locale.toLowerCase();
  const language = normalized.split("-")[0] ?? normalized;
  return (
    map[normalized] ??
    Object.entries(map).find(([key]) => key.split("-")[0] === language)?.[1] ??
    map.en ??
    ""
  );
}

function featureConditionHolds(
  ids: readonly string[] | undefined,
  context: NewsFeedContext,
  wantUsed: boolean,
): boolean {
  if (!ids || ids.length === 0) return true;
  return ids.every((id) => {
    // An unknown or undetectable feature fails closed: the item is skipped.
    if (!isDiscoverableFeatureId(id)) return false;
    const used = context.isFeatureUsed(id);
    return used !== undefined && used === wantUsed;
  });
}

/** The items to show right now, highest weight first. */
export function selectNewsFeedItems(
  feed: NewsFeed | null,
  context: NewsFeedContext,
): SelectedNewsItem[] {
  if (!feed || feed.paused) return [];
  return feed.items
    .filter((item) => {
      if (item.start && Date.parse(item.start) > context.now) return false;
      if (item.end && Date.parse(item.end) <= context.now) return false;
      if (item.minAppVersion && compareVersions(context.appVersion, item.minAppVersion) < 0)
        return false;
      if (item.maxAppVersion && compareVersions(context.appVersion, item.maxAppVersion) > 0)
        return false;
      if (item.platforms && !item.platforms.includes(context.platform)) return false;
      if (!featureConditionHolds(item.unlessUsed, context, false)) return false;
      if (!featureConditionHolds(item.onlyIfUsed, context, true)) return false;
      return true;
    })
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      weight: item.weight ?? 1,
      content: item.text
        ? { text: pickLocalized(item.text, context.locale) }
        : { template: item.template! },
      ...(item.action ? { action: item.action } : {}),
      ...(item.action?.type === "url" && item.action.label
        ? { actionLabel: pickLocalized(item.action.label, context.locale) }
        : {}),
    }))
    .toSorted((a, b) => b.weight - a.weight);
}
