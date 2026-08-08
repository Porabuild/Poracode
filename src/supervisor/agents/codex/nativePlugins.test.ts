import { describe, expect, it } from "vitest";
import { parseEnabledCodexPlugins } from "./nativePlugins";

describe("parseEnabledCodexPlugins", () => {
  it("returns only installed and enabled native plugins", () => {
    expect(
      parseEnabledCodexPlugins(
        JSON.stringify({
          installed: [
            {
              name: "github",
              installed: true,
              enabled: true,
              source: { path: "C:\\plugins\\github" },
            },
            {
              name: "browser",
              installed: true,
              enabled: false,
              source: { path: "C:\\plugins\\browser" },
            },
            { name: "stale", installed: false, enabled: true, source: { path: "/stale" } },
            { name: "missing-root", installed: true, enabled: true },
          ],
        }),
      ),
    ).toEqual([{ name: "github", root: "C:\\plugins\\github" }]);
  });

  it("uses the Poracode fallback for invalid output", () => {
    expect(parseEnabledCodexPlugins("not json")).toEqual([]);
    expect(parseEnabledCodexPlugins(JSON.stringify({ installed: null }))).toEqual([]);
  });
});
