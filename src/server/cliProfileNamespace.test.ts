import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertChannelProfileNamespace,
  defaultCliProfileNamespace,
  legacyProfileNotice,
  serviceProfileForRelease,
  sameChannelProfile,
} from "./cliProfileNamespace";

describe("standalone CLI profile defaults", () => {
  it("separates published nightly releases from stable desktop data", () => {
    const home = tmpdir();
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, home)).toBe(
      join(home, ".poracode-nightly"),
    );
    expect(defaultCliProfileNamespace("2.0.0", {}, home)).toBe(join(home, ".poracode"));
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
        "stable profile",
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses either channel against the other default but permits a custom profile", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-channel-profile-")));
    try {
      const alias = join(home, "alias");
      symlinkSync(home, alias, "junction");
      expect(() =>
        assertChannelProfileNamespace("2.0.0-nightly.202611100001", join(alias, ".poracode"), home),
      ).toThrow(/other channel/u);
      expect(() =>
        assertChannelProfileNamespace("2.0.0", join(home, ".poracode-nightly"), home),
      ).toThrow(/other channel/u);
      expect(() =>
        assertChannelProfileNamespace("2.0.0-nightly.202611100001", join(home, "custom"), home),
      ).not.toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("honors case-sensitive volumes for an uncreated custom profile", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-channel-case-")));
    try {
      const left = join(home, ".PORACODE");
      const right = join(home, ".poracode");
      expect(sameChannelProfile(left, right, () => false)).toBe(false);
      expect(sameChannelProfile(left, right, () => true)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("detects case lookup in an initially empty directory without leaving a probe", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-channel-empty-")));
    try {
      writeFileSync(join(root, "CaseMarker"), "");
      const home = join(root, "empty");
      mkdirSync(home);
      expect(sameChannelProfile(join(home, ".PORACODE"), join(home, ".poracode"))).toBe(
        existsSync(join(root, "caseMarker")),
      );
      expect(readdirSync(home)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the actual parent directory's case behavior for a default namespace", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "poracode-channel-case-")));
    try {
      writeFileSync(join(home, "CaseMarker"), "");
      const otherCase = join(home, ".PORACODE");
      const insensitive = existsSync(join(home, "caseMarker"));
      let refused = false;
      try {
        assertChannelProfileNamespace("2.0.0-nightly.202611100001", otherCase, home);
      } catch {
        refused = true;
      }
      expect(refused).toBe(insensitive);
      expect(serviceProfileForRelease("2.0.0-nightly.202611100001", otherCase, home)).toBe(
        insensitive ? join(home, ".poracode-nightly") : undefined,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
