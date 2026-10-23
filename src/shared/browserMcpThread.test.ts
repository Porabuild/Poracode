import { describe, expect, it } from "vitest";
import { decodeThreadIdentity, encodeThreadQuery } from "./browserMcpThread";

describe("MCP endpoint identity", () => {
  it("preserves restrictions on provider-level endpoints without a thread id", () => {
    const url = encodeThreadQuery("http://localhost/mcp?existing=value", {
      disabledTools: ["create_thread", "send_to_thread"],
    });
    expect(decodeThreadIdentity(url)).toEqual({
      disabledTools: ["create_thread", "send_to_thread"],
    });
    expect(new URL(url).searchParams.get("existing")).toBe("value");
  });

  it("round-trips existing thread identity and restrictions", () => {
    const identity = {
      threadId: "thread & one",
      title: "A title & query?",
      disabledTools: ["read_thread"],
      deviceProof: "proof+value",
    };
    expect(decodeThreadIdentity(encodeThreadQuery("http://localhost/mcp", identity))).toEqual(
      identity,
    );
    expect(encodeThreadQuery("http://localhost/mcp", {})).toBe("http://localhost/mcp");
  });
});
