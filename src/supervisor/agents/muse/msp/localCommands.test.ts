import { describe, expect, it } from "vitest";

import { isMuseCompactCommand } from "./localCommands";

describe("isMuseCompactCommand", () => {
  it("matches the bare gesture regardless of case and padding", () => {
    expect(isMuseCompactCommand("/compact")).toBe(true);
    expect(isMuseCompactCommand("  /compact  ")).toBe(true);
    expect(isMuseCompactCommand("/COMPACT")).toBe(true);
  });

  it("does not match prompts that merely mention it", () => {
    expect(isMuseCompactCommand("/compact now")).toBe(false);
    expect(isMuseCompactCommand("please run /compact")).toBe(false);
    expect(isMuseCompactCommand("compact")).toBe(false);
    expect(isMuseCompactCommand("")).toBe(false);
  });
});
