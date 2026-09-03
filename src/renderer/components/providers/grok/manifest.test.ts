// @vitest-environment node

import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("Grok renderer manifest", () => {
  it("owns local session-media roots and excludes remote sessions", () => {
    const input = {
      sessionId: "session-1",
      projectLocation: { kind: "windows" as const, path: "E:\\work\\project" },
      homeDir: "C:\\Users\\me",
    };
    expect(manifest.resolveMarkdownImageRoots?.(input)).toEqual([
      "C:\\Users\\me\\.grok\\sessions\\E%3A%5Cwork%5Cproject\\session-1",
    ]);
    expect(manifest.resolveMarkdownImageRoots?.({ ...input, isRemote: true })).toBeUndefined();
  });
});
