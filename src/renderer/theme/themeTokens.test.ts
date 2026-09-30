import { describe, expect, it } from "vitest";
import { buildVariant, type ThemeSpec } from "./themeTokens";

const spec: ThemeSpec = {
  bg: "#101010",
  surface: "#181818",
  fg: "#f0f0f0",
  accent: "#3366ff",
  accentFg: "#ffffff",
  border: "#2a2a2a",
  sidebar: "#000000",
};

describe("buildVariant", () => {
  it("lets the content background show through the docked sidebar by default", () => {
    expect(buildVariant(spec, "dark")["--sidebar-panel-background"]).toBe("#101010");
  });

  it("paints the docked sidebar with the sidebar color when sidebarFill is set", () => {
    const vars = buildVariant({ ...spec, sidebarFill: true }, "dark");
    expect(vars["--sidebar-panel-background"]).toBe("#000000");
  });

  it("uses the shared selected-row wash in the sidebar unless one is given", () => {
    expect(buildVariant(spec, "dark")["--sidebar-row-active"]).toBe("var(--row-active)");
    expect(
      buildVariant({ ...spec, sidebarRowActive: "#1a1a1a" }, "dark")["--sidebar-row-active"],
    ).toBe("#1a1a1a");
  });

  it("derives the composer fill from the surface unless one is given", () => {
    expect(buildVariant(spec, "dark")["--composer-surface"]).toContain("color-mix");
    expect(buildVariant({ ...spec, composer: "#141414" }, "dark")["--composer-surface"]).toBe(
      "#141414",
    );
  });
});
