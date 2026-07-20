import type { MetadataRoute } from "next";

import { CHANGELOG } from "@/lib/changelog";
import { LOCALE_CODES } from "@/lib/i18n/config";
import { getLatestNightlyRelease, getLatestRelease } from "@/lib/releases";
import { absoluteUrl, buildLanguageAlternates, localizedPath, SITEMAP_ROUTES } from "@/lib/seo";

function validDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [stableRelease, nightlyRelease] = await Promise.all([
    getLatestRelease(),
    getLatestNightlyRelease(),
  ]);
  const changelogDate = validDate(CHANGELOG[0]?.date);
  const lastModifiedByPath: Readonly<Record<string, Date | undefined>> = {
    "/": validDate(stableRelease.publishedAt) ?? changelogDate,
    "/download": validDate(stableRelease.publishedAt) ?? changelogDate,
    "/changelog": changelogDate,
    "/nightly": validDate(nightlyRelease.publishedAt),
    "/privacy": validDate("2026-07-15"),
  };

  // Translated routes carry their full hreflang cluster; English-only routes
  // appear once without language alternatives.
  return SITEMAP_ROUTES.flatMap<MetadataRoute.Sitemap[number]>((route) => {
    const lastModified = lastModifiedByPath[route.path];
    if (!route.localized) {
      return [
        {
          url: absoluteUrl(route.path),
          ...(lastModified ? { lastModified } : {}),
          changeFrequency: route.changeFrequency,
          priority: route.priority,
        },
      ];
    }

    const languages = buildLanguageAlternates(route.path);
    return LOCALE_CODES.map((locale) => ({
      url: absoluteUrl(localizedPath(route.path, locale)),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: { languages },
    }));
  });
}
