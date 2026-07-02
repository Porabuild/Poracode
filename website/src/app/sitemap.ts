import type { MetadataRoute } from "next";

import { LOCALE_CODES } from "@/lib/i18n/config";
import { absoluteUrl, buildLanguageAlternates, localizedPath, SITEMAP_ROUTES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // One entry per (route × locale). Every entry carries the full hreflang
  // cluster (all locales + x-default) so Google sees each language as part of
  // the same translated set.
  return SITEMAP_ROUTES.flatMap((route) => {
    const languages = buildLanguageAlternates(route.path);
    return LOCALE_CODES.map((locale) => ({
      url: absoluteUrl(localizedPath(route.path, locale)),
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: { languages },
    }));
  });
}
