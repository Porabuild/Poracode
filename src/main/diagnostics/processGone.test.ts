import { describe, expect, it } from "vitest";
import { classifyRendererProcessGone } from "./processGone";

describe("renderer process-gone diagnostics", () => {
  it("does not report clean exits or explicit user lifecycle terminations", () => {
    expect(classifyRendererProcessGone({ reason: "clean-exit" }, "darwin")).toBeNull();
    expect(classifyRendererProcessGone({ reason: "killed" }, "darwin", "app-shutdown")).toBeNull();
    expect(classifyRendererProcessGone({ reason: "killed" }, "win32", "reload")).toBeNull();
    expect(classifyRendererProcessGone({ reason: "killed" }, "linux", "window-close")).toBeNull();
  });

  it.each([
    ["crashed", "crash"],
    ["oom", "memory-pressure"],
    ["memory-eviction", "memory-pressure"],
    ["abnormal-exit", "abnormal-exit"],
    ["launch-failed", "launch-failure"],
    ["integrity-failure", "integrity-failure"],
    ["killed", "unexpected-kill"],
  ] as const)("normalizes %s into a stable %s bucket", (reason, bucket) => {
    expect(classifyRendererProcessGone({ reason }, "linux")).toEqual({
      bucket,
      fingerprint: ["poracode-renderer-process-gone", "linux", bucket],
    });
  });
});
