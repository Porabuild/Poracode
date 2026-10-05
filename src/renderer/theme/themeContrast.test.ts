import { describe, expect, it } from "vitest";
import { themeTextContrast, TEXT_CONTRAST_MINIMUM } from "./themeContrast";
const palette = {
  bg: "#000",
  surface: "#fff",
  fg: "#fff",
  accent: "#fff",
  accentFg: "#000",
  border: "#444",
};
describe("theme contrast guidance", () => {
  it("checks sidebar chrome even when the docked sidebar uses content", () => {
    expect(
      themeTextContrast({ ...palette, content: "#000", sidebar: "#fff" }, "dark"),
    ).toMatchObject({
      content: 21,
      surface: 1,
      sidebar: 1,
      accent: 21,
    });
    expect(
      themeTextContrast({ ...palette, sidebar: "#fff", sidebarFill: true }, "dark").sidebar,
    ).toBe(1);
    expect(themeTextContrast({ ...palette, sidebarFill: true }, "dark").sidebar).toBe(1);
  });
  it("invalidates only the affected ratios while colors are being typed", () => {
    expect(themeTextContrast({ ...palette, surface: "#xy" }, "dark")).toMatchObject({
      content: 21,
      surface: null,
      sidebar: null,
      muted: null,
      accent: 21,
    });
  });
  it("does not round a failing contrast ratio into a passing result", () => {
    const value = themeTextContrast({ ...palette, fg: "#777", content: "#fff" }, "light").content!;
    expect(value.toFixed(1)).toBe("4.5");
    expect(value).toBeLessThan(TEXT_CONTRAST_MINIMUM);
  });
});

it("checks explicit composer and selected-row fills and leaves automatic fills unscored", () => {
  expect(themeTextContrast(palette, "dark")).toMatchObject({
    composer: null,
    sidebarRowActive: null,
  });
  expect(
    themeTextContrast({ ...palette, composer: "#fff", sidebarRowActive: "#fff" }, "dark"),
  ).toMatchObject({ composer: 1, sidebarRowActive: 1 });
});
