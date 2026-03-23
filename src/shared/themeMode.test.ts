import { describe, expect, it } from "vitest";
import { resolveThemeMode } from "./themeMode";

describe("resolveThemeMode", () => {
  it("returns the explicit theme when it is not system", () => {
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("light", true)).toBe("light");
  });

  it("uses the system preference for system theme mode", () => {
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });
});
