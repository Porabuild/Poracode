import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("V6 B.7 HostIdentity confinement", () => {
  it("keeps MANAGED_LOOPBACK_DESKTOP_ID inside hostTransport", () => {
    let output = "";
    try {
      output = execFileSync(
        "git",
        ["grep", "-n", "MANAGED_LOOPBACK_DESKTOP_ID", "--", "src", ":!src/renderer/hostTransport"],
        { encoding: "utf8", cwd: process.cwd() },
      ).trim();
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? error.status : 1;
      if (status !== 1) throw error;
    }
    expect(output).toBe("");
  });
});
