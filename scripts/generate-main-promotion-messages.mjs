#!/usr/bin/env node
/**
 * Generates `src/main/i18n/promotionMessages.generated.ts`: the two promotion
 * progress strings in every supported locale, copied verbatim from the renderer
 * catalogs.
 *
 * The promotion progress window is created in Electron main BEFORE the renderer
 * (and its i18n runtime) exists, so it cannot read the `.po` catalogs at
 * runtime. This script is the only bridge between those catalogs and that
 * window; it never introduces translated text of its own.
 *
 * Usage:
 *   node scripts/generate-main-promotion-messages.mjs           # write the file
 *   node scripts/generate-main-promotion-messages.mjs --check   # fail on drift
 *
 * The generated subset is committed and guarded by
 * `src/main/i18n/promotionMessages.generated.test.ts` (node vitest project), so
 * an i18n extraction or translation change shows up as a failing test until
 * this script is re-run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The only message keys main needs before the renderer i18n runtime exists. */
export const PROMOTION_MESSAGE_KEYS = Object.freeze([
  "desktop.promotion.progress.title",
  "desktop.promotion.progress.body",
]);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SHARED_MESSAGES_PATH = join(REPO_ROOT, "src/shared/messages.ts");
const DEFAULT_LOCALE_SOURCE_PATH = join(REPO_ROOT, "src/shared/locale.ts");
const DEFAULT_LOCALES_DIR = join(REPO_ROOT, "src/renderer/locales");
const DEFAULT_OUTPUT_PATH = join(REPO_ROOT, "src/main/i18n/promotionMessages.generated.ts");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Read the English source template for one key from the macro-free catalog. */
function readSourceTemplate(sharedMessagesSource, key) {
  const match = sharedMessagesSource.match(
    new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "u"),
  );
  if (!match) {
    throw new Error(
      `src/shared/messages.ts has no string literal for "${key}"; promotion messages cannot be generated.`,
    );
  }
  return JSON.parse(match[1]);
}

/** Read the canonical locale list so a missing catalog or locale fails loudly. */
function readSupportedLocales(localeSource) {
  const match = localeSource.match(/export const SUPPORTED_LOCALES = \[([\s\S]*?)\] as const;/u);
  if (!match) throw new Error("src/shared/locale.ts does not declare SUPPORTED_LOCALES.");
  const locales = [...match[1].matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]);
  if (locales.length === 0) throw new Error("SUPPORTED_LOCALES is empty.");
  return locales;
}

/** Read one `msgid "..."` / `msgstr "..."` field from a PO entry block. */
function readPoField(block, field) {
  let collecting = false;
  let value = "";
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!collecting) {
      if (!line.startsWith(`${field} `)) continue;
      collecting = true;
      value += JSON.parse(line.slice(field.length + 1));
      continue;
    }
    if (!line.startsWith('"')) break;
    value += JSON.parse(line);
  }
  return collecting ? value : undefined;
}

function parsePoMessages(poSource, description) {
  const messages = new Map();
  for (const block of poSource.split(/\n{2,}/u)) {
    const id = readPoField(block, "msgid");
    if (id === undefined) continue;
    const value = readPoField(block, "msgstr");
    if (value === undefined) {
      throw new Error(`${description} has a msgid without a msgstr for ${JSON.stringify(id)}.`);
    }
    messages.set(id, value);
  }
  return messages;
}

/**
 * Build the two-key subset from the source catalog and every locale catalog.
 * Throws when a locale catalog, msgid, or translation is absent or empty, so a
 * stale extraction can never silently ship an English window in a translated
 * UI.
 */
export function buildPromotionMessages(options = {}) {
  const sharedMessagesPath = options.sharedMessagesPath ?? DEFAULT_SHARED_MESSAGES_PATH;
  const localesDir = options.localesDir ?? DEFAULT_LOCALES_DIR;
  const locales =
    options.locales ?? readSupportedLocales(readFileSync(DEFAULT_LOCALE_SOURCE_PATH, "utf8"));
  const sharedMessagesSource = readFileSync(sharedMessagesPath, "utf8");
  const templates = new Map(
    PROMOTION_MESSAGE_KEYS.map((key) => [key, readSourceTemplate(sharedMessagesSource, key)]),
  );

  const messages = Object.fromEntries(PROMOTION_MESSAGE_KEYS.map((key) => [key, {}]));
  for (const locale of locales) {
    const catalogPath = join(localesDir, locale, "messages.po");
    if (!existsSync(catalogPath)) {
      throw new Error(`Missing locale catalog: ${catalogPath}`);
    }
    const catalog = parsePoMessages(readFileSync(catalogPath, "utf8"), `${locale}/messages.po`);
    for (const key of PROMOTION_MESSAGE_KEYS) {
      const msgid = templates.get(key);
      const value = catalog.get(msgid);
      if (value === undefined) {
        throw new Error(
          `${locale}/messages.po is missing the "${key}" translation ` +
            `(msgid ${JSON.stringify(msgid)}); run \`pnpm i18n:extract\` first.`,
        );
      }
      if (value === "") {
        throw new Error(
          `${locale}/messages.po has an empty "${key}" translation; fill it before regenerating.`,
        );
      }
      messages[key][locale] = value;
    }
  }
  return messages;
}

function localePropertyName(locale) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(locale) ? locale : JSON.stringify(locale);
}

/** Render the committed module; the output is deterministic and oxfmt-stable. */
function renderGeneratedModule(messages, locales) {
  const union = PROMOTION_MESSAGE_KEYS.map((key) => `  | ${JSON.stringify(key)}`).join("\n");
  const blocks = PROMOTION_MESSAGE_KEYS.map((key) => {
    const entries = locales
      .map(
        (locale) => `    ${localePropertyName(locale)}: ${JSON.stringify(messages[key][locale])},`,
      )
      .join("\n");
    return `  ${JSON.stringify(key)}: {\n${entries}\n  },`;
  }).join("\n");
  return `/**
 * Auto-generated by \`scripts/generate-main-promotion-messages.mjs\`.
 *
 * The promotion progress window is created in Electron main before the renderer
 * and its i18n runtime exist, so it cannot consult the \`.po\` catalogs at
 * runtime. This committed subset carries only the two strings that window
 * renders, copied verbatim from \`src/shared/messages.ts\` (source text) and
 * the renderer locale catalogs (translations). Do not edit this file by hand;
 * regenerate it and let \`promotionMessages.generated.test.ts\` prove it is
 * current.
 */
import type { SupportedLocale } from "@/shared/locale";

export type PromotionProgressMessageKey =
${union};

export const PROMOTION_PROGRESS_MESSAGES: Record<
  PromotionProgressMessageKey,
  Record<SupportedLocale, string>
> = {
${blocks}
};
`;
}

function main(argv) {
  const check = argv.includes("--check");
  const messages = buildPromotionMessages();
  const locales = Object.keys(messages[PROMOTION_MESSAGE_KEYS[0]]);
  const rendered = renderGeneratedModule(messages, locales);
  const existing = existsSync(DEFAULT_OUTPUT_PATH)
    ? readFileSync(DEFAULT_OUTPUT_PATH, "utf8")
    : undefined;

  if (check) {
    if (existing === rendered) {
      console.log("Main promotion messages are current.");
      return 0;
    }
    console.error(
      "Main promotion messages are stale. Run: node scripts/generate-main-promotion-messages.mjs",
    );
    return 1;
  }

  if (existing === rendered) {
    console.log("Main promotion messages already current.");
    return 0;
  }
  writeFileSync(DEFAULT_OUTPUT_PATH, rendered);
  console.log(
    `Wrote ${relative(REPO_ROOT, DEFAULT_OUTPUT_PATH)} ` +
      `(${PROMOTION_MESSAGE_KEYS.length} keys × ${locales.length} locales).`,
  );
  return 0;
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) process.exitCode = main(process.argv.slice(2));
