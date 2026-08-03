import { describe, expect, it } from "vitest";
import { isRemoteProjectStatusUnreachable } from "./reachability";

describe("isRemoteProjectStatusUnreachable", () => {
  const remoteProject = { remoteServerId: "desktop-1" };

  it.each([
    ["online", false],
    ["error", false],
    ["connecting", true],
    ["offline", true],
    [undefined, true],
  ] as const)("treats %s as unreachable: %s", (status, expected) => {
    expect(isRemoteProjectStatusUnreachable(remoteProject, status)).toBe(expected);
  });

  it("always treats local projects as reachable", () => {
    expect(isRemoteProjectStatusUnreachable({}, "offline")).toBe(false);
  });
});
