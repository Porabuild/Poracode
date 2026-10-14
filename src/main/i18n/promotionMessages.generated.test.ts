import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/shared/locale";
import { buildPromotionMessages } from "../../../scripts/generate-main-promotion-messages.mjs";
import { PROMOTION_PROGRESS_MESSAGES } from "./promotionMessages.generated";

const KEYS = ["desktop.promotion.progress.title", "desktop.promotion.progress.body"] as const;
const roots: string[] = [];

function fixtureLocalesDir(content: string): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-promotion-messages-"));
  roots.push(root);
  mkdirSync(join(root, "de"), { recursive: true });
  writeFileSync(join(root, "de", "messages.po"), content);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generated main promotion messages", () => {
  it("matches the renderer catalogs (regenerate: node scripts/generate-main-promotion-messages.mjs)", () => {
    expect(PROMOTION_PROGRESS_MESSAGES).toEqual(buildPromotionMessages());
  });

  it("carries only the two promotion keys for all 13 locales", () => {
    expect(Object.keys(PROMOTION_PROGRESS_MESSAGES).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      expect(Object.keys(PROMOTION_PROGRESS_MESSAGES[key])).toEqual([...SUPPORTED_LOCALES]);
      expect(
        Object.values(PROMOTION_PROGRESS_MESSAGES[key]).every((value) => value.length > 0),
      ).toBe(true);
    }
  });

  it("fails generation when a locale is missing the translation", () => {
    const localesDir = fixtureLocalesDir(
      'msgid "Poracode"\nmsgstr "Poracode"\n\nmsgid "Promoting this profile into the owned data root…"\nmsgstr "übersetzt"\n',
    );
    const withoutBody = fixtureLocalesDir('msgid "Poracode"\nmsgstr "Poracode"\n');
    expect(() => buildPromotionMessages({ localesDir, locales: ["de"] })).not.toThrow();
    expect(() => buildPromotionMessages({ localesDir: withoutBody, locales: ["de"] })).toThrow(
      /missing the "desktop\.promotion\.progress\.body" translation/u,
    );
  });

  it("fails generation when a catalog msgstr is empty", () => {
    const localesDir = fixtureLocalesDir(
      'msgid "Poracode"\nmsgstr "Poracode"\n\nmsgid "Promoting this profile into the owned data root…"\nmsgstr ""\n',
    );
    expect(() => buildPromotionMessages({ localesDir, locales: ["de"] })).toThrow(
      /empty "desktop\.promotion\.progress\.body" translation/u,
    );
  });
});
