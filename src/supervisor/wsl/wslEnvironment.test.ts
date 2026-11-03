import { describe, expect, it } from "vitest";
import { wslEnvironment } from "./wslChild";

describe("WSL environment forwarding", () => {
  it("keeps credential values in the environment and carries only names in WSLENV", () => {
    const env = wslEnvironment(
      { API_TOKEN: "private-token-value", MCP_REGION: "eu", EXISTING: "override" },
      "EXISTING/u:PATH/p",
    );
    expect(env).toEqual({
      API_TOKEN: "private-token-value",
      MCP_REGION: "eu",
      EXISTING: "override",
      WSLENV: "EXISTING/u:PATH/p:API_TOKEN:MCP_REGION",
    });
    expect(env.WSLENV).not.toContain("private-token-value");
    expect(wslEnvironment({}, "EXISTING/u")).toEqual({});
  });
});
