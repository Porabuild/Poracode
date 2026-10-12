import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { MANAGED_LOOPBACK_DESKTOP_ID, managedLoopbackNoticeAuthority } from "./managedIdentity";

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

  it("hands out the notice authority as a per-activation capability without exposing the identity", () => {
    // Stable within an activation, distinct across activations: a notice
    // authored by one leg can never match a successor's authority.
    const first = managedLoopbackNoticeAuthority(3);
    expect(managedLoopbackNoticeAuthority(3)).toBe(first);
    expect(managedLoopbackNoticeAuthority(4)).not.toBe(first);
    // Provenance: the authority embeds the unguessable per-process identity,
    // so only the managed leg that minted it can produce a matching key.
    expect(first).toContain(MANAGED_LOOPBACK_DESKTOP_ID);
    expect(first).not.toBe(MANAGED_LOOPBACK_DESKTOP_ID);
  });
});
