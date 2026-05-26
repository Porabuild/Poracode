import { describe, expect, it } from "vitest";
import { detectLanguageFromPath, normalizeHighlightLanguage } from "./languageDetect";

describe("normalizeHighlightLanguage", () => {
  it("maps markdown class names and aliases onto supported languages", () => {
    expect(normalizeHighlightLanguage("language-css")).toBe("css");
    expect(normalizeHighlightLanguage("language-js")).toBe("javascript");
    expect(normalizeHighlightLanguage("lang-yml")).toBe("yaml");
    expect(normalizeHighlightLanguage("foo language-tsx")).toBe("tsx");
    expect(normalizeHighlightLanguage("language-1:30:AGENTS.md")).toBe("markdown");
    expect(normalizeHighlightLanguage("language-src/App.tsx")).toBe("tsx");
  });

  it("returns null for empty and unsupported language tokens", () => {
    expect(normalizeHighlightLanguage("language-")).toBeNull();
    expect(normalizeHighlightLanguage("language-text")).toBeNull();
    expect(normalizeHighlightLanguage(undefined)).toBeNull();
  });
});

describe("detectLanguageFromPath", () => {
  it("reuses the same normalization for file extensions", () => {
    expect(detectLanguageFromPath("styles/site.css")).toBe("css");
    expect(detectLanguageFromPath("notes/plan.mdx")).toBe("markdown");
    expect(detectLanguageFromPath("README.unknown")).toBe("plain");
  });
});
