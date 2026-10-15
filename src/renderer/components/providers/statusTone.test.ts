import { describe, expect, it } from "vitest";
import { getStatusTone } from "./statusTone";

describe("getStatusTone waiting for background work", () => {
  it("uses the quiet active tone for every eligible settled or working status", () => {
    for (const status of ["working", "idle", "finished"] as const) {
      expect(
        getStatusTone(
          { status, done: false },
          { hasBackgroundActivity: true, isWaitingForBackground: true },
        ),
      ).toBe("active");
    }
  });

  it("keeps done, errors, attention and inactive threads unmasked", () => {
    const waiting = { hasBackgroundActivity: true, isWaitingForBackground: true };
    expect(getStatusTone({ status: "working", done: true }, waiting)).toBe("done");
    expect(getStatusTone({ status: "error", done: false }, waiting)).toBe("error");
    expect(getStatusTone({ status: "needs_reply", done: false }, waiting)).toBe("attention");
    expect(getStatusTone({ status: "inactive", done: false }, waiting)).toBe("inactive");
  });

  it("keeps background activity working when the turn is not waiting", () => {
    expect(getStatusTone({ status: "idle", done: false }, { hasBackgroundActivity: true })).toBe(
      "working",
    );
  });
});
