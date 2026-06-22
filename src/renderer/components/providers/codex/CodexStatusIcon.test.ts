import { describe, expect, it } from "vitest";
import { getStatusTone } from "../statusTone";

describe("getStatusTone", () => {
  it("keeps unopened resumable threads inactive", () => {
    expect(
      getStatusTone({
        done: false,
        status: "inactive",
      }),
    ).toBe("inactive");
  });

  it("marks initialized idle threads as active", () => {
    expect(
      getStatusTone({
        done: false,
        status: "idle",
      }),
    ).toBe("active");
  });

  it("treats launching threads as inactive until initialization completes", () => {
    expect(
      getStatusTone({
        done: false,
        status: "launching",
      }),
    ).toBe("inactive");
  });

  it("treats running threads as working", () => {
    expect(
      getStatusTone({
        done: false,
        status: "working",
      }),
    ).toBe("working");
  });

  it("renders done over stale runtime statuses", () => {
    for (const status of ["idle", "finished", "working", "needs_reply", "error"] as const) {
      expect(
        getStatusTone({
          done: true,
          status,
        }),
      ).toBe("done");
    }
  });

  it("shows a live background workflow as working over a settled status", () => {
    for (const status of ["idle", "finished"] as const) {
      expect(getStatusTone({ done: false, status }, { hasLiveWorkflow: true })).toBe("working");
    }
  });

  it("never lets a live workflow mask error or attention statuses", () => {
    expect(getStatusTone({ done: false, status: "error" }, { hasLiveWorkflow: true })).toBe(
      "error",
    );
    expect(
      getStatusTone({ done: false, status: "needs_approval" }, { hasLiveWorkflow: true }),
    ).toBe("attention");
    expect(getStatusTone({ done: false, status: "inactive" }, { hasLiveWorkflow: true })).toBe(
      "inactive",
    );
    expect(getStatusTone({ done: true, status: "idle" }, { hasLiveWorkflow: true })).toBe("done");
  });

  it("is unchanged when no workflow flag is passed", () => {
    expect(getStatusTone({ done: false, status: "finished" })).toBe("finished");
    expect(getStatusTone({ done: false, status: "idle" }, { hasLiveWorkflow: false })).toBe(
      "active",
    );
  });
});
