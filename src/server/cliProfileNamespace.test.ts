import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultCliProfileNamespace, legacyProfileNotice } from "./cliProfileNamespace";

describe("standalone CLI profile defaults", () => {
  it("separates published nightly releases from stable desktop data", () => {
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, "/home/u")).toBe(
      "/home/u/.poracode-nightly",
    );
    expect(defaultCliProfileNamespace("2.0.0", {}, "/home/u")).toBe("/home/u/.poracode");
  });

  it("keeps an explicit pre-upgrade namespace for existing service definitions", () => {
    expect(
      defaultCliProfileNamespace(
        "2.0.0-nightly.202611091529",
        { PORACODE_BASE_DIR: "/home/u/.poracode" },
        "/home/u",
      ),
    ).toBe("/home/u/.poracode");
  });

  it("discloses an existing non-service profile without silently adopting it", () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-profile-notice-"));
    try {
      mkdirSync(join(home, ".poracode.host-v1"));
      const selected = defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, home);
      expect(selected).toBe(join(home, ".poracode-nightly"));
      expect(legacyProfileNotice("2.0.0-nightly.202611091529", selected, home)).toContain(
        "--base-dir",
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
