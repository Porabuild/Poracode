import { describe, expect, it } from "vitest";
import { getCodexStatusTone } from "./CodexStatusIcon";

describe("getCodexStatusTone", () => {
  it("keeps unopened resumable threads inactive", () => {
    expect(
      getCodexStatusTone({
        status: "inactive",
      }),
    ).toBe("inactive");
  });

  it("marks initialized idle threads as active", () => {
    expect(
      getCodexStatusTone({
        status: "idle",
      }),
    ).toBe("active");
  });

  it("treats launching threads as inactive until initialization completes", () => {
    expect(
      getCodexStatusTone({
        status: "launching",
      }),
    ).toBe("inactive");
  });

  it("treats running threads as working", () => {
    expect(
      getCodexStatusTone({
        status: "working",
      }),
    ).toBe("working");
  });
});
