import { describe, expect, it } from "vitest";
import { defaultFastEnabled } from "./modelConfig";

describe("defaultFastEnabled", () => {
  it("keeps Claude's premium Fast mode an explicit choice", () => {
    expect(defaultFastEnabled("claude")).toBe(false);
  });
});
