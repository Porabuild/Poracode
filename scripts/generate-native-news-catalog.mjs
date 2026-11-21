#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allUsageProviderDescriptors } from "@poracode/agents-usage/providers";
import { DISCOVERABLE_FEATURE_IDS } from "../src/shared/featureDiscovery.ts";
import { SUPPORTED_LOCALES } from "../src/shared/locale.ts";
import { COMMUNITY_PROMOTION_URLS } from "../src/shared/communityLinks.ts";
import { parsePoMessages } from "./generate-main-promotion-messages.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(root, "src/renderer/components/newsLine/featureCatalog.ts"),
  "utf8",
);
const ids = DISCOVERABLE_FEATURE_IDS;
const locales = SUPPORTED_LOCALES;
const catalogs = new Map(
  locales.map((locale) => [
    locale,
    parsePoMessages(
      readFileSync(resolve(root, `src/renderer/locales/${locale}/messages.po`), "utf8"),
      locale,
    ),
  ]),
);
const copy = (message) =>
  Object.fromEntries(
    locales.map((locale) => {
      const translated = catalogs.get(locale).get(message);
      if (!translated?.trim()) throw new Error(`Missing ${locale} translation: ${message}`);
      return [locale, translated];
    }),
  );
const features = [];
for (const match of source.matchAll(/\{\n\s+id: "([^"]+)",([\s\S]*?)\n  \},/gu)) {
  const [, id, body] = match;
  const pitch = body.match(/pitch: msg`([^`]+)`/u)?.[1];
  const action = body.match(/action: msg`([^`]+)`/u)?.[1];
  const icon = body.match(/icon: ([A-Za-z]+),/u)?.[1];
  if (!pitch || !action || !icon) throw new Error(`Unsupported discovery source shape: ${id}`);
  features.push({ id, icon, pitch: copy(pitch), action: copy(action) });
}
if (features.map((feature) => feature.id).join("\0") !== ids.join("\0"))
  throw new Error("Native news catalog does not cover every stable discovery ID.");
const staticMessages = [
  "News",
  "News line",
  "Activity highlights",
  "Previous",
  "Next",
  "Pause news",
  "Resume news",
  "Hide this",
  "Show me",
  "View profile",
  "Usage",
  "Open",
  "What's New",
  "Close",
  "Include your streaks, prompt counts, and usage limits in the news line.",
  "Enjoying Poracode? A star helps others find it",
  "Star on GitHub",
  "Release notes and tips, first on X",
  "Behind the scenes from the person building Poracode",
];
const nativeMessages = {
  "news.streak.best": {
    source: "{current, plural, one {# day} other {# days}} in a row · your best streak yet",
    args: [["current", "lld"]],
    plural: "current",
  },
  "news.streak.previous": {
    source: "{current, plural, one {# day} other {# days}} in a row · your best is {longest}",
    args: [
      ["current", "lld"],
      ["longest", "lld"],
    ],
    plural: "current",
  },
  "news.week": {
    source: "{prompts, plural, one {# prompt} other {# prompts}} this week",
    args: [["prompts", "lld"]],
    plural: "prompts",
  },
  "news.week.busiest": {
    source: "{prompts, plural, one {# prompt} other {# prompts}} this week · busiest on {weekday}",
    args: [
      ["prompts", "lld"],
      ["weekday", "@"],
    ],
    plural: "prompts",
  },
  "news.model": {
    source: "<0>{label}</0> handles {percent}% of your prompts",
    args: [
      ["label", "@"],
      ["percent", "@"],
    ],
  },
  "news.hour": { source: "You're most active around {hourLabel}", args: [["hourLabel", "@"]] },
  "news.task": { source: "Your longest task ran {duration}", args: [["duration", "@"]] },
  "news.stars": { source: "Poracode just passed {count} stars on GitHub", args: [["count", "@"]] },
  "news.issues": {
    source:
      "{issues, plural, one {# good first issue is} other {# good first issues are}} open. Want to contribute?",
    args: [["issues", "lld"]],
    plural: "issues",
  },
  "news.new": { source: "New in {version}", args: [["version", "@"]] },
  "news.improved": { source: "Improved in {version}", args: [["version", "@"]] },
  "news.fixed": { source: "Fixed in {version}", args: [["version", "@"]] },
  "news.follow": { source: "Follow {0}", args: [["0", "@"]] },
  "news.used": { source: "{percent}% used", args: [["percent", "@"]] },
  "news.reset": { source: "resets in {countdown}", args: [["countdown", "@"]] },
  "news.point": {
    source: "Point {position} of {total} in {version}",
    args: [
      ["position", "lld"],
      ["total", "lld"],
      ["version", "@"],
    ],
  },
};
function closingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("Unbalanced native news translation");
}
function formatText(text, spec) {
  return text
    .replace(/<\/?[0-9]+>/gu, "")
    .replace(/%/gu, "%%")
    .replace(/\{([A-Za-z0-9]+)\}/gu, (_, name) => {
      const i = spec.args.findIndex(([key]) => key === name);
      if (i < 0) throw new Error(`Unknown native news parameter ${name}`);
      return `%${i + 1}$${spec.args[i][1]}`;
    })
    .replace(
      /#/gu,
      spec.plural ? `%${spec.args.findIndex(([key]) => key === spec.plural) + 1}$lld` : "#",
    );
}
function nativeTranslation(text, spec) {
  if (!spec.plural) return { stringUnit: { state: "translated", value: formatText(text, spec) } };
  const match = new RegExp(`\\{${spec.plural},\\s*plural,\\s*`, "u").exec(text);
  if (!match) throw new Error(`Missing plural ${spec.plural}`);
  const end = closingBrace(text, match.index);
  let offset = match.index + match[0].length;
  const variants = {};
  while (offset < end) {
    const option = /^\s*(zero|one|two|few|many|other)\s*\{/u.exec(text.slice(offset));
    if (!option) throw new Error(`Unsupported native plural form in ${text}`);
    const open = offset + option[0].length - 1;
    const close = closingBrace(text, open);
    const expanded = text.slice(0, match.index) + text.slice(open + 1, close) + text.slice(end + 1);
    variants[option[1]] = {
      stringUnit: { state: "translated", value: formatText(expanded, spec) },
    };
    offset = close + 1;
  }
  if (!variants.other) throw new Error("Missing native other plural");
  return { variations: { plural: variants } };
}
const localeMap = { "pt-BR": "pt-BR", "zh-CN": "zh-Hans" };
const stringCatalog = {
  sourceLanguage: "en",
  strings: Object.fromEntries(
    Object.entries(nativeMessages).map(([key, spec]) => [
      key,
      {
        extractionState: "manual",
        localizations: Object.fromEntries(
          locales.map((locale) => {
            const translated = catalogs.get(locale).get(spec.source);
            if (!translated?.trim())
              throw new Error(`Missing ${locale} news format ${spec.source}`);
            return [localeMap[locale] ?? locale, nativeTranslation(translated, spec)];
          }),
        ),
      },
    ]),
  ),
  version: "1.0",
};
const promotions = Object.entries(COMMUNITY_PROMOTION_URLS).map(([id, url]) => ({ id, url }));
const output =
  JSON.stringify(
    {
      formatVersion: 1,
      features,
      promotions,
      usageProviders: allUsageProviderDescriptors().map(({ id, label }) => ({ id, label })),
      messages: Object.fromEntries(staticMessages.map((message) => [message, copy(message)])),
    },
    null,
    2,
  ) + "\n";
const path = resolve(root, "ios/App/App/Features/HomeNews/HomeNewsCatalog.json");
const stringsPath = resolve(root, "ios/App/App/Features/HomeNews/HomeNews.xcstrings");
const stringsOutput = JSON.stringify(stringCatalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(stringsPath, "utf8") !== stringsOutput)
    throw new Error("Native news formats are stale.");
  if (readFileSync(path, "utf8") !== output)
    throw new Error(
      "Native news catalog is stale; run node scripts/generate-native-news-catalog.mjs.",
    );
  console.log("Native news catalog is current.");
} else {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  writeFileSync(stringsPath, stringsOutput);
  console.log(`Generated ${features.length} native news features in ${locales.length} locales.`);
}
