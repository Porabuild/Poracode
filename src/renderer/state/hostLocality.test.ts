import { describe, expect, it } from "vitest";
import { hostRunsOnThisMachine, projectHostRunsOnThisMachine } from "./hostLocality";

describe("hostRunsOnThisMachine", () => {
  it("is true for the desktop's own rows and false for a paired host's", () => {
    expect(hostRunsOnThisMachine({})).toBe(true);
    expect(hostRunsOnThisMachine({ remoteServerId: undefined })).toBe(true);
    expect(hostRunsOnThisMachine({ remoteServerId: "pc" })).toBe(false);
    expect(hostRunsOnThisMachine(undefined)).toBe(true);
    expect(hostRunsOnThisMachine(null)).toBe(true);
  });
});

describe("projectHostRunsOnThisMachine", () => {
  it("needs both the project row and its location to be local", () => {
    expect(projectHostRunsOnThisMachine({ location: {} })).toBe(true);
    expect(projectHostRunsOnThisMachine({ remoteServerId: "pc", location: {} })).toBe(false);
    expect(projectHostRunsOnThisMachine({ location: { remoteServerId: "pc" } })).toBe(false);
  });
});
