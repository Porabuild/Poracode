import { describe, expect, it } from "vitest";
import { toMspApprovalMode, buildMuseServeArgs } from "./argv";

describe("toMspApprovalMode", () => {
  it.each([
    ["read-only", "promptUnmatched"],
    ["untrusted", "promptUnmatched"],
    ["on-request", "onRequest"],
    ["never", "allowAll"],
    ["yolo", "allowAll"],
    ["bypassPermissions", "allowAll"],
    [undefined, "onRequest"],
    ["something-new", "onRequest"],
  ])("maps %s to %s", (policy, expected) => {
    expect(toMspApprovalMode(policy)).toBe(expected);
  });

  it("keeps untrusted as prompt-unmatched authority rather than a workspace-write gate", () => {
    // The host's built-in workspace filesystem authority already covers
    // project-root writes, so `untrusted` does not prompt for them. It is not
    // an allow-all mode either: the approval policy and sandbox both stay on.
    expect(toMspApprovalMode("untrusted")).toBe("promptUnmatched");
    expect(buildMuseServeArgs("untrusted")).toEqual(["serve", "--trust-workspace"]);
  });

  it("keeps read-only session-scoped instead of fixing a partial host write posture", () => {
    expect(buildMuseServeArgs("read-only")).toEqual(["serve", "--trust-workspace"]);
    expect(buildMuseServeArgs("read-only")).not.toContain("--disable-write");
    expect(toMspApprovalMode("read-only")).toBe("promptUnmatched");
  });
});

describe("buildMuseServeArgs", () => {
  it("builds the durable trusted host by default", () => {
    expect(buildMuseServeArgs("on-request")).toEqual(["serve", "--trust-workspace"]);
    expect(buildMuseServeArgs(undefined)).toEqual(["serve", "--trust-workspace"]);
  });

  it("disables the sandbox only for the full-bypass policy", () => {
    expect(buildMuseServeArgs("yolo")).toEqual(["serve", "--trust-workspace", "--disable-sandbox"]);
    expect(buildMuseServeArgs("bypassPermissions")).toEqual([
      "serve",
      "--trust-workspace",
      "--disable-sandbox",
    ]);
    expect(buildMuseServeArgs("never")).toEqual(["serve", "--trust-workspace"]);
  });

  it("supports ephemeral hosts for the detection probe", () => {
    expect(buildMuseServeArgs(undefined, { noSessionLog: true })).toEqual([
      "serve",
      "--no-session-log",
      "--trust-workspace",
    ]);
  });
});
