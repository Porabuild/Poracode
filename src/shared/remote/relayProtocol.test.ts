import { describe, expect, it } from "vitest";
import { parseRelayVisitorPath, relayPublicUrl } from "./relayProtocol";

describe("relayProtocol helpers", () => {
  it("builds a visitor public URL with the /s/<id>/ prefix", () => {
    expect(relayPublicUrl("https://relay.example.com", "srv-1")).toBe(
      "https://relay.example.com/s/srv-1/",
    );
    expect(relayPublicUrl("https://relay.example.com/base/", "a b")).toBe(
      "https://relay.example.com/base/s/a%20b/",
    );
  });

  it("parses /s/<id>/<rest> into serverId + path", () => {
    expect(parseRelayVisitorPath("/s/srv-1/api/snapshot")).toEqual({
      serverId: "srv-1",
      path: "/api/snapshot",
    });
    expect(parseRelayVisitorPath("/s/srv-1")).toEqual({ serverId: "srv-1", path: "/" });
    expect(parseRelayVisitorPath("/s/srv-1/")).toEqual({ serverId: "srv-1", path: "/" });
    expect(parseRelayVisitorPath("/s/a%20b/x")).toEqual({ serverId: "a b", path: "/x" });
  });

  it("rejects non-visitor paths", () => {
    expect(parseRelayVisitorPath("/host")).toBeNull();
    expect(parseRelayVisitorPath("/healthz")).toBeNull();
    expect(parseRelayVisitorPath("/s/")).toBeNull();
    expect(parseRelayVisitorPath("/")).toBeNull();
  });
});
