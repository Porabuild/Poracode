import type { Metadata } from "next";

import contact from "../../../branding/contact.json";
import { LANDING_FAQ_ITEMS } from "@/lib/landingFaq";
import type { ReleaseInfo } from "@/lib/releases";
import { DEFAULT_LOCALE, LOCALE_CODES, localizedPath, type Locale } from "./i18n/config";
import { translate } from "./i18n/messages";

export { localizedPath } from "./i18n/config";

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
export const GITHUB_URL = "https://github.com/SDSLeon/lightcode";
export const SOCIAL_IMAGE_PATH = "/hero-screenshot.png";
export const SOCIAL_IMAGE_ALT = "Poracode AI coding agent orchestrator social card";
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

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
  "MCP server for coding agents",
  "agent to agent delegation",
  "Crossagents",
  "multi agent coding workflow",
  "Git worktree automation",
  "AI agent skills marketplace",
  "on-device voice dictation for coding",
  "open source AI coding agent app",
  "free Claude Code GUI",
  "run coding agents over SSH",
  "developer tools",
];

export const SITEMAP_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1, localized: true },
  { path: "/download", changeFrequency: "daily", priority: 0.9, localized: true },
  { path: "/about", changeFrequency: "monthly", priority: 0.6, localized: false },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.7, localized: false },
  { path: "/nightly", changeFrequency: "daily", priority: 0.5, localized: true },
  { path: "/support", changeFrequency: "monthly", priority: 0.4, localized: false },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2, localized: false },
] as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
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
  const localized = SITEMAP_ROUTES.find((route) => route.path === path)?.localized ?? true;

  return {
    title: {
      absolute: title,
    },
    description,
    keywords: SEO_KEYWORDS,
    alternates: {
      canonical,
      ...(localized ? { languages: buildLanguageAlternates(path) } : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      ...(localized
        ? { alternateLocale: LOCALE_CODES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]) }
        : {}),
      type: "website",
      images: [
        {
          url: absoluteUrl("/opengraph-image"),
          width: SOCIAL_IMAGE_WIDTH,
          height: SOCIAL_IMAGE_HEIGHT,
          alt: SOCIAL_IMAGE_ALT,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: absoluteUrl("/twitter-image"),
          width: SOCIAL_IMAGE_WIDTH,
          height: SOCIAL_IMAGE_HEIGHT,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
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
    description: SITE_DESCRIPTION,
    email: contact.supportEmail,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
    sameAs: [GITHUB_URL],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "technical support",
      email: contact.supportEmail,
      url: absoluteUrl("/support"),
    },
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
      "Let agents orchestrate the app through built-in MCP servers: threads, worktrees, Git, pull requests, MCP servers, skills, and settings",
      "Delegate work from one coding agent to another with Crossagents",
      "Compare agents on the same prompt in parallel worktrees and merge the winner",
      "Schedule recurring agent runs and automate pull-request watching and merging",
      "Install agent skills from public marketplaces and share them across every provider",
      "Dictate prompts with on-device Whisper speech recognition",
      "Rewind a conversation to an earlier checkpoint and restore the files with it",
      "Run agents on remote machines over SSH with an auto-installed runtime",
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
    alternateName: ["Pora.code", "poracode.com"],
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

export function createAboutJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${absoluteUrl("/about")}#page`,
    url: absoluteUrl("/about"),
    name: `About ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
    mainEntity: {
      "@id": `${SITE_URL}/#software`,
    },
    about: [{ "@id": `${SITE_URL}/#software` }, { "@id": `${SITE_URL}/#organization` }],
  };
}

export function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
