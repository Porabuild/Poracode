import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { snapshotWorkspaceScope, type ApprovedThreadWorkspaceScope } from "./workspaceScope";

const primary: ProjectLocation = { kind: "posix", path: "/repo", remoteServerId: "host" };
const scope = (): ApprovedThreadWorkspaceScope => ({
  primaryLocation: primary,
  additionalDirectories: [{ ...primary, path: "/extra" }],
  revision: 1,
});

describe("internal approved workspace snapshot", () => {
  it.each([
    { revision: -1 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { additionalDirectories: undefined },
    { additionalDirectories: null },
    { additionalDirectories: Array.from({ length: 17 }, () => primary) },
    { additionalDirectories: [{ ...primary, path: "relative" }] },
    { additionalDirectories: [{ ...primary, path: "/bad\0path" }] },
    { additionalDirectories: [{ ...primary, path: "/" + "x".repeat(4096) }] },
    {
      additionalDirectories: Array.from({ length: 16 }, () => ({
        ...primary,
        path: "/" + "x".repeat(3000),
      })),
    },
    { additionalDirectories: [{ kind: "posix", path: "/extra" }] },
    { additionalDirectories: [{ ...primary, remoteServerId: "other" }] },
    { additionalDirectories: [{ kind: "windows", path: "C:\\extra", remoteServerId: "host" }] },
  ])("refuses malformed or foreign authorization without recovering it as empty: %j", (change) => {
    expect(() =>
      snapshotWorkspaceScope({ ...scope(), ...change } as ApprovedThreadWorkspaceScope, primary),
    ).toThrow(/./u);
  });

  it("keeps duplicate-primary intent nonempty for launch qualification", () => {
    const result = snapshotWorkspaceScope(
      { ...scope(), additionalDirectories: [primary] },
      primary,
    );
    expect(result.additionalDirectories).toEqual([primary]);
  });

  it("snapshots normalized primary, metadata and entries without freezing caller objects", () => {
    const input = scope();
    const result = snapshotWorkspaceScope(input, primary);
    expect(result.primaryLocation).not.toBe(input.primaryLocation);
    expect(result.additionalDirectories).not.toBe(input.additionalDirectories);
    expect(result.additionalDirectories[0]).not.toBe(input.additionalDirectories[0]);
    expect(Object.isFrozen(result.primaryLocation)).toBe(true);
    expect(Object.isFrozen(result.additionalDirectories)).toBe(true);
    expect(Object.isFrozen(primary)).toBe(false);
    expect(() => snapshotWorkspaceScope(input, { ...primary, path: "/other" })).toThrow("primary");
  });

  it("validates WSL host mappings and distro identity before any resolution", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };
    const candidate = {
      primaryLocation: location,
      additionalDirectories: [
        { ...location, linuxPath: "/extra", uncPath: "\\\\wsl.localhost\\Ubuntu\\extra" },
      ],
      revision: 0,
    };
    expect(snapshotWorkspaceScope(candidate, location)).toEqual(candidate);
    expect(() =>
      snapshotWorkspaceScope(
        { ...candidate, additionalDirectories: [{ ...location, linuxPath: "/different" }] },
        location,
      ),
    ).toThrow("mapping");
    const foreign: ProjectLocation = {
      ...location,
      distro: "Debian",
      uncPath: "\\\\wsl.localhost\\Debian\\repo",
    };
    expect(() =>
      snapshotWorkspaceScope({ ...candidate, additionalDirectories: [foreign] }, location),
    ).toThrow("environment");
  });
});
