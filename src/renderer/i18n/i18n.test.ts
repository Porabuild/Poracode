import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapAppLocaleFromCache, i18n } from "./i18n";

const CACHE_KEY = "lightcode-shared-settings";

describe("bootstrapAppLocaleFromCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    // Restore the source locale so sibling tests render in English.
    i18n.activate("en");
  });

  it("activates the explicit cached locale before mount", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ locale: "es" }));
    await bootstrapAppLocaleFromCache();
    expect(i18n.locale).toBe("es");
  });

  it("falls back to the source locale when no cache exists", async () => {
    await bootstrapAppLocaleFromCache();
    expect(i18n.locale).toBe("en");
  });

  it("resolves a non-string locale value to the source locale", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ locale: 123 }));
    await bootstrapAppLocaleFromCache();
    expect(i18n.locale).toBe("en");
  });

  it("ignores a malformed cache without throwing", async () => {
    localStorage.setItem(CACHE_KEY, "{not json");
    await expect(bootstrapAppLocaleFromCache()).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
  });
});
