import { describe, expect, it } from "vitest";
import { buildEnterUrl, buildForwardUrl, isDirectEndpoint } from "./portForward";

describe("PWA port forwarding URLs", () => {
  it("recognizes direct HTTP endpoints", () => {
    expect(isDirectEndpoint("http://192.168.1.10:3200")).toBe(true);
    expect(isDirectEndpoint("https://desktop.example.test")).toBe(false);
    expect(isDirectEndpoint("https://relay.example.test/s/desktop-1/")).toBe(false);
  });

  it("builds direct and authenticated proxy URLs", () => {
    expect(buildForwardUrl("192.168.1.10", 4100)).toBe("http://192.168.1.10:4100/");
    expect(
      buildEnterUrl("https://relay.example.test/s/desktop-1/", "/forward/fwd-1/enter?fwt=token"),
    ).toBe("https://relay.example.test/s/desktop-1/forward/fwd-1/enter?fwt=token");
  });
});
