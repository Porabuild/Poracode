import { describe, expect, it } from "vitest";
import { claudeSdkCliParityDefaults } from "./sdkCliParity";

describe("claudeSdkCliParityDefaults", () => {
  it("opts into the Artifact tools when the shell env does not set the flag", () => {
    expect(claudeSdkCliParityDefaults(undefined)).toEqual({ CLAUDE_CODE_ARTIFACT: "1" });
    expect(claudeSdkCliParityDefaults({ HOME: "/home/demo" })).toEqual({
      CLAUDE_CODE_ARTIFACT: "1",
    });
  });

  it("yields to any value the shell env sets, including an explicit opt-out", () => {
    expect(claudeSdkCliParityDefaults({ CLAUDE_CODE_ARTIFACT: "0" })).toEqual({});
    expect(claudeSdkCliParityDefaults({ CLAUDE_CODE_ARTIFACT: "" })).toEqual({});
  });
});
