import { describe, expect, it } from "vitest";
import { resolveAiLanguageName, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("returns an explicit supported locale", () => {
    expect(resolveLocale("ja", ["en-US"])).toBe("ja");
  });

  it("matches exact regional system locales", () => {
    expect(resolveLocale("system", ["zh-CN"])).toBe("zh-CN");
    expect(resolveLocale("system", ["pt-BR"])).toBe("pt-BR");
  });

  it("falls back from regional preferences to supported base locales", () => {
    expect(resolveLocale("system", ["de-AT"])).toBe("de");
    expect(resolveLocale("system", ["uk-UA"])).toBe("uk");
  });

  it("falls back to a single supported regional locale with the same base language", () => {
    expect(resolveLocale("system", ["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveLocale("system", ["pt-PT"])).toBe("pt-BR");
  });

  it("falls back to the source locale when no preferred language is supported", () => {
    expect(resolveLocale("system", ["it-IT"])).toBe("en");
  });
});

describe("resolveAiLanguageName", () => {
  it("returns undefined for an explicit English selection (no directive needed)", () => {
    expect(resolveAiLanguageName("en", "system", ["de-DE"])).toBeUndefined();
  });

  it("returns the English name of an explicitly pinned language", () => {
    expect(resolveAiLanguageName("de", "system", ["en-US"])).toBe("German");
    expect(resolveAiLanguageName("ru", "en", ["en-US"])).toBe("Russian");
  });

  it("follows the app locale when set to match-app", () => {
    expect(resolveAiLanguageName("match-app", "de", ["en-US"])).toBe("German");
  });

  it("resolves match-app through the OS locale when the app locale is system", () => {
    expect(resolveAiLanguageName("match-app", "system", ["pt-BR"])).toBe("Brazilian Portuguese");
  });

  it("returns undefined when match-app resolves to English", () => {
    expect(resolveAiLanguageName("match-app", "system", ["en-US"])).toBeUndefined();
    expect(resolveAiLanguageName("match-app", "en", ["de-DE"])).toBeUndefined();
  });
});
