import type { Metadata } from "next";

import { LANDING_FAQ_ITEMS } from "@/lib/landingFaq";
import type { ReleaseInfo } from "@/lib/releases";
import { DEFAULT_LOCALE, LOCALE_CODES, type Locale } from "./i18n/config";
import { translate } from "./i18n/messages";

// Open Graph wants language_TERRITORY, not the BCP-47 tags we route with.
const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  uk: "uk_UA",
  pl: "pl_PL",
  tr: "tr_TR",
  vi: "vi_VN",
  ja: "ja_JP",
  ko: "ko_KR",
  "zh-CN": "zh_CN",
};

export const SITE_NAME = "Poracode";
export const SITE_URL = "https://poracode.com";
export const GITHUB_URL = "https://github.com/poracode/poracode";
export const SOCIAL_IMAGE_PATH = "/hero-screenshot.png";
export const SOCIAL_IMAGE_ALT =
  "Poracode desktop app showing AI coding agents running side by side";

export const SITE_TITLE = "Poracode - AI Coding Agent Desktop for Claude Code, Codex & Gemini";
export const SITE_DESCRIPTION =
  "Poracode is an open-source desktop app for running Claude Code, Codex, Gemini, Cursor, OpenCode, and ACP agents side by side with terminals, diffs, browser previews, worktrees, and PRs.";

export const SEO_KEYWORDS = [
  "Poracode",
  "Poracode app",
  "Poracode desktop app",
  "AI coding agents",
  "Claude Code desktop app",
  "Codex desktop app",
  "Gemini coding agent",
  "Cursor agent",
  "OpenCode",
  "ACP Registry",
  "AI agent orchestrator",
  "developer tools",
];

export const SITEMAP_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/download", changeFrequency: "daily", priority: 0.9 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/nightly", changeFrequency: "daily", priority: 0.5 },
] as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * Canonical path for a page in a given locale. The default locale (en) is served
 * unprefixed at the root (e.g. "/download") so the already-indexed English URLs
 * are preserved; every other locale is prefixed (e.g. "/es/download").
 */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  if (path === "/") return `/${locale}`;
  return `/${locale}${path}`;
}

/**
 * hreflang cluster for a page: an absolute URL per locale plus an `x-default`
 * pointing at the unprefixed (English) URL. Used for both <link rel="alternate">
 * tags and the sitemap's xhtml:link alternates.
 */
export function buildLanguageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const code of LOCALE_CODES) {
    languages[code] = absoluteUrl(localizedPath(path, code));
  }
  languages["x-default"] = absoluteUrl(path);
  return languages;
}

export function createPageMetadata({
  title,
  description,
  path,
  locale = DEFAULT_LOCALE,
}: {
  title: string;
  description: string;
  path: string;
  locale?: Locale;
}): Metadata {
  const canonical = localizedPath(path, locale);
  const url = absoluteUrl(canonical);

  return {
    title: {
      absolute: title,
    },
    description,
    keywords: SEO_KEYWORDS,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(path),
    },
    // og:image / twitter:image are supplied by the file-convention card at
    // app/opengraph-image.tsx (1200x630). SOCIAL_IMAGE_PATH (the app screenshot)
    // is kept for the SoftwareApplication JSON-LD `image` instead.
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALE_CODES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function createHomeJsonLd(release: ReleaseInfo, locale: Locale = DEFAULT_LOCALE) {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
    sameAs: [GITHUB_URL],
  };

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    // Brand aliases help Google disambiguate the app from the unrelated
    // "Poracode" music project and other software firms ranking for the term,
    // and tie the entity to the poracode.com domain-match query.
    alternateName: [
      "Poracode App",
      "Poracode Desktop",
      "Poracode Desktop App",
      "Poracode AI Agent Orchestrator",
      "poracode.com",
    ],
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "AI coding assistant workspace",
    operatingSystem: "macOS, Windows, Linux",
    url: SITE_URL,
    downloadUrl: absoluteUrl("/download"),
    image: absoluteUrl(SOCIAL_IMAGE_PATH),
    description: SITE_DESCRIPTION,
    codeRepository: GITHUB_URL,
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    releaseNotes: absoluteUrl("/changelog"),
    sameAs: [GITHUB_URL],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    isAccessibleForFree: true,
    author: {
      "@id": `${SITE_URL}/#organization`,
    },
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    featureList: [
      "Run Claude Code, Codex, Gemini, Cursor, OpenCode, and ACP agents",
      "Use terminal-native and structured chat workflows side by side",
      "Keep browser previews, Git diffs, branches, worktrees, and PRs in one workspace",
      "Resume persistent AI coding sessions across macOS, Windows, and Linux",
    ],
    potentialAction: {
      "@type": "DownloadAction",
      target: absoluteUrl("/download"),
    },
    ...(release.version ? { softwareVersion: release.version } : {}),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: translate(locale, item.questionKey),
      acceptedAnswer: {
        "@type": "Answer",
        text: translate(locale, item.answerKey),
      },
    })),
  };

  return [organization, website, softwareApplication, faqPage];
}

export function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
