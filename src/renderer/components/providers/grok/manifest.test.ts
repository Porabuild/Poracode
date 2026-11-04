// @vitest-environment node

import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("Grok renderer manifest", () => {
  it("owns session-media roots under the host's home directory and needs one", () => {
    const input = {
      sessionId: "session-1",
      projectLocation: { kind: "windows" as const, path: "E:\\work\\project" },
      homeDir: "C:\\Users\\me",
    };
    expect(manifest.resolveMarkdownImageRoots?.(input)).toEqual([
      "C:\\Users\\me\\.grok\\sessions\\E%3A%5Cwork%5Cproject\\session-1",
    ]);
    const { homeDir: _homeDir, ...withoutHome } = input;
    expect(manifest.resolveMarkdownImageRoots?.(withoutHome)).toBeUndefined();
  });
});
