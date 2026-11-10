import { describe, expect, it } from "vitest";
import { compareCliReleaseVersions } from "./cliReleaseVersion";

describe("CLI release ordering", () => {
  it("orders nightly builds numerically and never treats a stable release as older", () => {
    expect(compareCliReleaseVersions("2.0.0-nightly.10", "2.0.0-nightly.9")).toBe(1);
    expect(compareCliReleaseVersions("2.0.0", "2.0.0-nightly.10")).toBe(1);
    expect(compareCliReleaseVersions("2.0.0-nightly.10", "2.0.0")).toBe(-1);
    expect(compareCliReleaseVersions("2.0.0", "2.0.0")).toBe(0);
    expect(compareCliReleaseVersions("garbage", "2.0.0")).toBeUndefined();
  });
});
