import { describe, expect, it } from "vitest";
import { buildEnterUrl, buildRawTcpUrl, isDirectEndpoint } from "./portForward";

describe("PWA port forwarding URLs", () => {
  it("recognizes direct HTTP endpoints", () => {
    expect(isDirectEndpoint("http://192.168.1.10:3200")).toBe(true);
    expect(isDirectEndpoint("https://desktop.example.test")).toBe(false);
    expect(isDirectEndpoint("https://relay.example.test/s/desktop-1/")).toBe(false);
  });

  it("builds the explicit raw TCP address and the authenticated enter URL", () => {
    expect(buildRawTcpUrl("192.168.1.10", 4100)).toBe("http://192.168.1.10:4100/");
    expect(
      buildEnterUrl("https://relay.example.test/s/desktop-1/", "/forward/fwd-1/enter?fwt=token"),
    ).toBe("https://relay.example.test/s/desktop-1/forward/fwd-1/enter?fwt=token");
  });

  it("keeps the relay base path in the enter URL and drops endpoint query parameters", () => {
    // Entry shape is a compatibility boundary: the enter path carries its own
    // single-use token query, so any query on the endpoint must not leak in.
    expect(
      buildEnterUrl(
        "https://relay.example.test/s/desktop-1/?session=abc",
        "/forward/fwd-1/enter?fwt=token",
      ),
    ).toBe("https://relay.example.test/s/desktop-1/forward/fwd-1/enter?fwt=token");
  });
});
