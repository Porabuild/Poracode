import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_THEME_VERSION,
  MAX_CUSTOM_THEMES,
  MAX_THEME_JSON_LENGTH,
  hexColorSchema,
  normalizeCustomThemes,
  parseThemeDocument,
  type ThemePalette,
} from "@/shared/customThemes";
import { themeTextContrast } from "@/renderer/theme/themeContrast";
import { buildVariant } from "@/renderer/theme/themeTokens";

const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-custom-themes.json", "utf8"),
);

describe("native custom theme compatibility vectors", () => {
  it("pins the released authoring format, limits, Unicode names and strict optional fields", () => {
    expect(fixture.formatVersion).toBe(CUSTOM_THEME_VERSION);
    expect(fixture.maximumThemes).toBe(MAX_CUSTOM_THEMES);
    expect(fixture.maximumBytes).toBe(MAX_THEME_JSON_LENGTH);
    for (const sample of fixture.documents) {
      const parsed =
        Buffer.byteLength(sample.json) <= MAX_THEME_JSON_LENGTH
          ? parseThemeDocument(sample.json)
          : null;
      expect(parsed).toEqual(sample.expected);
    }
  });
  it("pins supported colors without accepting names, alpha or trailing whitespace", () => {
    for (const sample of fixture.hex)
      expect(hexColorSchema.safeParse(sample.value).success).toBe(sample.valid);
  });
  it("pins per-record rejection and first-valid-ID deduplication", () => {
    expect(normalizeCustomThemes(fixture.records)).toEqual(fixture.expectedKnownRecords);
  });
  it("pins native contrast warnings and secondary text derivation to the PWA", () => {
    for (const sample of fixture.palettes) {
      const palette: ThemePalette = sample.palette;
      expect(themeTextContrast(palette, "light")).toEqual(sample.ratios);
    }
    for (const sample of fixture.palettes.filter(
      (entry: { muted: string | null }) => entry.muted !== null,
    )) {
      expect(buildVariant(sample.palette, "light")["--muted"]).toBe(sample.muted);
    }
  });
});
