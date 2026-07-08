import { describe, expect, it } from "vitest";
import { buildEnterUrl, buildForwardUrl, isDirectEndpoint } from "./portForward";

describe("isDirectEndpoint", () => {
  it("treats a plain LAN endpoint as direct", () => {
    expect(isDirectEndpoint("http://192.168.1.20:38987/")).toBe(true);
  });

  it("treats a loopback endpoint as direct", () => {
    expect(isDirectEndpoint("http://127.0.0.1:38987/")).toBe(true);
  });

  it("rejects an https endpoint", () => {
    expect(isDirectEndpoint("https://192.168.1.20:38987/")).toBe(false);
  });

  it("rejects a relay-mounted endpoint even over http", () => {
    expect(isDirectEndpoint("http://relay.example.test/s/server-1/")).toBe(false);
  });

  it("rejects a relay-mounted https endpoint", () => {
    expect(isDirectEndpoint("https://relay.example.test/s/server-1/")).toBe(false);
  });

  it("returns false for an unparsable endpoint", () => {
    expect(isDirectEndpoint("not a url")).toBe(false);
  });
});

describe("buildForwardUrl", () => {
  it("builds an http URL from the advertised host and listen port", () => {
    expect(buildForwardUrl("192.168.1.20", 54231)).toBe("http://192.168.1.20:54231/");
  });
});

describe("buildEnterUrl", () => {
  it("appends the enter path to a plain LAN endpoint", () => {
    expect(buildEnterUrl("http://192.168.1.20:38987/", "/forward/fwd-1/enter?fwt=tok")).toBe(
      "http://192.168.1.20:38987/forward/fwd-1/enter?fwt=tok",
    );
  });

  it("preserves the relay's /s/<serverId>/ path prefix", () => {
    expect(
      buildEnterUrl("https://relay.example.test/s/server-1/", "/forward/fwd-1/enter?fwt=tok"),
    ).toBe("https://relay.example.test/s/server-1/forward/fwd-1/enter?fwt=tok");
  });

  it("does not duplicate slashes when the endpoint lacks a trailing slash", () => {
    expect(
      buildEnterUrl("https://relay.example.test/s/server-1", "/forward/fwd-1/enter?fwt=tok"),
    ).toBe("https://relay.example.test/s/server-1/forward/fwd-1/enter?fwt=tok");
  });

  it("does not duplicate slashes when the endpoint has multiple trailing slashes", () => {
    expect(buildEnterUrl("http://192.168.1.20:38987//", "/forward/fwd-1/enter?fwt=tok")).toBe(
      "http://192.168.1.20:38987/forward/fwd-1/enter?fwt=tok",
    );
  });
});
