import { describe, expect, it } from "vitest";
import { defaultHomeProfileDir, slugifyProfileName, uniqueProfileId } from "./ProfileSettingsModel";

describe("ProfileSettingsModel", () => {
  it("builds provider-scoped home directories from profile names", () => {
    expect(defaultHomeProfileDir("codex", "Work Account")).toBe(
      "~/.poracode/codex-profiles/work-account",
    );
    expect(defaultHomeProfileDir("gemini", "Personal")).toBe(
      "~/.poracode/gemini-profiles/personal",
    );
  });

  it("normalizes empty and punctuation-only names", () => {
    expect(slugifyProfileName("  !!!  ")).toBe("profile");
  });

  it("chooses the next unused profile id", () => {
    expect(uniqueProfileId("Work", { work: {}, "work-2": {} })).toBe("work-3");
  });
});
