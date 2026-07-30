import { describe, expect, it } from "vitest";
import { cursorDefaultHiddenModels, isLegacyCursorModel } from "./defaultModelVisibility";

describe("Cursor default model visibility", () => {
  it.each([
    ["gpt-5.5", "GPT-5.5", true],
    ["gpt-5.1-codex-max", "Codex 5.1 Max", true],
    ["gpt-4o", "GPT-4o", true],
    ["gpt-5.6-sol", "GPT-5.6 Sol", false],
    ["gpt-6", "GPT-6", false],
    ["claude-opus-4-8", "Opus 4.8", true],
    ["claude-4-6-sonnet", "Sonnet 4.6", true],
    ["claude-opus-5", "Opus 5", false],
    ["claude-sonnet-5-1", "Sonnet 5.1", false],
    ["composer-2-fast", "Composer 2 Fast", true],
    ["composer-2.5-fast", "Composer 2.5 Fast", false],
    ["gemini-2.5-pro", "Gemini 2.5 Pro", true],
    ["gemini-3-pro", "Gemini 3 Pro", true],
    ["gemini-3.1-pro", "Gemini 3.1 Pro", true],
    ["gemini-3.5-flash", "Gemini 3.5 Flash", true],
    ["gemini-3.6-flash", "Gemini 3.6 Flash", false],
    ["auto", "Auto", false],
  ])("%s (%s) legacy=%s", (id, label, expected) => {
    expect(isLegacyCursorModel({ id, label })).toBe(expected);
  });

  it("returns the exact ids Cursor should initially hide", () => {
    expect(
      cursorDefaultHiddenModels([
        { id: "composer-2", label: "Composer 2" },
        { id: "composer-2.5", label: "Composer 2.5" },
        { id: "gpt-5.5[reasoning=high]", label: "GPT-5.5 · High" },
        { id: "gpt-5.6", label: "GPT-5.6" },
        { id: "opus-4.8", label: "Opus 4.8" },
        { id: "sonnet-5", label: "Sonnet 5" },
        { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
        { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      ]),
    ).toEqual(["composer-2", "gpt-5.5[reasoning=high]", "opus-4.8", "gemini-3.5-flash"]);
  });

  it("keeps one model visible when a limited catalog only contains legacy models", () => {
    expect(
      cursorDefaultHiddenModels([
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "composer-2", label: "Composer 2" },
      ]),
    ).toEqual(["composer-2"]);
  });
});
