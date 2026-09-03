import { describe, expect, it } from "vitest";
import { classifyMuseServeExit } from "./exitClassification";

describe("classifyMuseServeExit", () => {
  it.each([
    [0, "clean"],
    [1, "unhandledError"],
    [2, "usageError"],
    [3, "configError"],
    [4, "sessionLeaseUnavailable"],
    [5, "sdkSurfaceUnavailable"],
  ])("classifies exit code %i as %s", (code, kind) => {
    expect(classifyMuseServeExit(code, null).kind).toBe(kind);
  });

  it("treats unknown codes, missing codes, and signals as crashes", () => {
    expect(classifyMuseServeExit(99, null).kind).toBe("crash");
    expect(classifyMuseServeExit(-1, null).kind).toBe("crash");
    expect(classifyMuseServeExit(null, null).kind).toBe("crash");
    expect(classifyMuseServeExit(null, "SIGKILL").kind).toBe("crash");
    expect(classifyMuseServeExit(0, "SIGTERM").kind).toBe("crash");
  });

  it("describes the remedy-relevant meaning", () => {
    expect(classifyMuseServeExit(2, null).detail).toMatch(/do not retry/i);
    expect(classifyMuseServeExit(4, null).detail).toMatch(/sessionInUse/);
    expect(classifyMuseServeExit(0, null).detail).toMatch(/durably closed/);
  });
});
