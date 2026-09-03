import { describe, expect, it } from "vitest";
import { toMspApprovalMode, buildMuseServeArgs } from "./argv";

describe("toMspApprovalMode", () => {
  it.each([
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
