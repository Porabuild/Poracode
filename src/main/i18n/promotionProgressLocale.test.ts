import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/shared/locale";
import {
  PROMOTION_SETTINGS_READ_MAX_BYTES,
  promotionProgressStringsFor,
  readSavedLocaleSetting,
  resolvePromotionProgressStrings,
} from "./promotionProgressLocale";

const roots: string[] = [];

function createRoots(): { sourceRoot: string; ownedRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "poracode-promotion-locale-"));
  roots.push(root);
  return { sourceRoot: join(root, "profile"), ownedRoot: join(root, "profile.host-v1") };
}

function writeSettings(root: string, content: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "settings.json"), content);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("promotion progress locale resolution", () => {
  it.each(SUPPORTED_LOCALES)("selects the %s catalog translation", async (locale) => {
    const { sourceRoot, ownedRoot } = createRoots();
    writeSettings(sourceRoot, `{"locale":"${locale}"}`);
    await expect(resolvePromotionProgressStrings({ sourceRoot, ownedRoot }, [])).resolves.toEqual(
      promotionProgressStringsFor(locale),
    );
  });

  it("lets an explicit saved locale win over the system languages", async () => {
    const { sourceRoot, ownedRoot } = createRoots();
    writeSettings(sourceRoot, JSON.stringify({ locale: "de", themeMode: "dark" }));
    await expect(
      resolvePromotionProgressStrings({ sourceRoot, ownedRoot }, ["uk-UA", "en-US"]),
    ).resolves.toEqual(promotionProgressStringsFor("de"));
  });

  it("follows system languages for locale: system and falls back to English", async () => {
    const { sourceRoot, ownedRoot } = createRoots();
    writeSettings(sourceRoot, JSON.stringify({ locale: "system" }));
    await expect(
      resolvePromotionProgressStrings({ sourceRoot, ownedRoot }, ["uk-UA", "en-US"]),
    ).resolves.toEqual(promotionProgressStringsFor("uk"));
    expect(promotionProgressStringsFor("uk")).not.toEqual(promotionProgressStringsFor("en"));
    await expect(resolvePromotionProgressStrings({ sourceRoot, ownedRoot }, [])).resolves.toEqual(
      promotionProgressStringsFor("en"),
    );
  });

  it("treats missing, corrupt, unknown, and oversized settings as system locale", async () => {
    const missing = createRoots();
    await expect(resolvePromotionProgressStrings(missing, ["ja-JP", "en-US"])).resolves.toEqual(
      promotionProgressStringsFor("ja"),
    );

    const unknown = createRoots();
    writeSettings(unknown.sourceRoot, JSON.stringify({ locale: "xx-YY" }));
    await expect(resolvePromotionProgressStrings(unknown, ["pl-PL"])).resolves.toEqual(
      promotionProgressStringsFor("pl"),
    );

    const corrupt = createRoots();
    writeSettings(corrupt.sourceRoot, '{"locale":');
    await expect(resolvePromotionProgressStrings(corrupt, ["tr-TR"])).resolves.toEqual(
      promotionProgressStringsFor("tr"),
    );

    const oversized = createRoots();
    writeSettings(
      oversized.sourceRoot,
      `{"locale":"de"}${" ".repeat(PROMOTION_SETTINGS_READ_MAX_BYTES + 1)}`,
    );
    await expect(resolvePromotionProgressStrings(oversized, [])).resolves.toEqual(
      promotionProgressStringsFor("en"),
    );
  });

  it("falls back to the owned root only when the source setting is absent", async () => {
    const resumed = createRoots();
    writeSettings(resumed.ownedRoot, JSON.stringify({ locale: "fr" }));
    await expect(resolvePromotionProgressStrings(resumed, ["de-DE"])).resolves.toEqual(
      promotionProgressStringsFor("fr"),
    );

    const sourceWins = createRoots();
    writeSettings(sourceWins.sourceRoot, JSON.stringify({ locale: "de" }));
    writeSettings(sourceWins.ownedRoot, JSON.stringify({ locale: "fr" }));
    await expect(resolvePromotionProgressStrings(sourceWins, [])).resolves.toEqual(
      promotionProgressStringsFor("de"),
    );
  });

  it("reads only a valid locale field from the raw settings file", async () => {
    const { sourceRoot } = createRoots();
    writeSettings(sourceRoot, JSON.stringify({ locale: "uk" }));
    await expect(readSavedLocaleSetting(join(sourceRoot, "settings.json"))).resolves.toBe("uk");

    writeSettings(sourceRoot, JSON.stringify({ locale: 7 }));
    await expect(
      readSavedLocaleSetting(join(sourceRoot, "settings.json")),
    ).resolves.toBeUndefined();

    writeSettings(sourceRoot, JSON.stringify(["de"]));
    await expect(
      readSavedLocaleSetting(join(sourceRoot, "settings.json")),
    ).resolves.toBeUndefined();
  });
});
