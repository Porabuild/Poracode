import { afterEach, describe, expect, it, vi } from "vitest";
import { relayLoopbackHopSecret } from "./relayHopSecret";
import {
  hasProxyForwardingHeaders,
  isDirectLoopbackPeer,
  RELAY_LOOPBACK_HOP_HEADER,
  resolvedTrustedProxies,
} from "./security";

/**
 * The ONE direct-loopback peer classifier shared by the desktop-internal
 * upgrade gate, `/metrics`, and experiment-command locality: a proxied dial
 * (relay hop, configured trusted proxy, or any proxy-forwarding header) is
 * never a direct local peer, even when the socket address is loopback.
 */

function request(
  remoteAddress: string | undefined,
  headers: Record<string, string | string[]> = {},
): Parameters<typeof isDirectLoopbackPeer>[0] {
  return { headers, socket: { remoteAddress } };
}

describe("isDirectLoopbackPeer", () => {
  it("admits a plain direct loopback dial", () => {
    expect(isDirectLoopbackPeer(request("127.0.0.1"), [])).toBe(true);
    expect(isDirectLoopbackPeer(request("127.8.8.8"), [])).toBe(true);
    expect(isDirectLoopbackPeer(request("::1"), [])).toBe(true);
    expect(isDirectLoopbackPeer(request("::ffff:127.0.0.1"), [])).toBe(true);
    // Unix-socket peers report no remote address; local by construction.
    expect(isDirectLoopbackPeer(request(""), [])).toBe(true);
    expect(isDirectLoopbackPeer(request("192.168.1.20"), [])).toBe(false);
  });

  it("still admits a direct loopback dial when only other addresses are trusted proxies", () => {
    expect(isDirectLoopbackPeer(request("127.0.0.1"), ["10.0.0.0/8"])).toBe(true);
  });

  it("refuses a loopback dial whose socket matches a configured trusted proxy", () => {
    expect(isDirectLoopbackPeer(request("127.0.0.1"), ["127.0.0.1"])).toBe(false);
    expect(isDirectLoopbackPeer(request("127.0.0.1"), ["127.0.0.0/8"])).toBe(false);
    expect(isDirectLoopbackPeer(request("::ffff:127.0.0.1"), ["127.0.0.1"])).toBe(false);
    expect(isDirectLoopbackPeer(request("10.1.2.3"), ["10.0.0.0/8"])).toBe(false);
  });

  it("refuses a loopback dial carrying any proxy-forwarding header", () => {
    // Even with NO trusted proxies configured: the header means the peer is
    // proxying for someone, so locality must fail closed. A genuine local
    // client sending one only downgrades itself.
    for (const header of ["x-forwarded-for", "forwarded", "x-real-ip"]) {
      expect(isDirectLoopbackPeer(request("127.0.0.1", { [header]: "203.0.113.9" }), [])).toBe(
        false,
      );
    }
    expect(
      isDirectLoopbackPeer(request("127.0.0.1", { "x-forwarded-for": ["203.0.113.9"] }), []),
    ).toBe(false);
    // Presence alone counts; an empty value is still a forwarding claim.
    expect(isDirectLoopbackPeer(request("127.0.0.1", { "x-forwarded-for": "" }), [])).toBe(false);
  });

  it("refuses a relay-marked loopback dial", () => {
    expect(
      isDirectLoopbackPeer(
        request("127.0.0.1", { [RELAY_LOOPBACK_HOP_HEADER]: relayLoopbackHopSecret() }),
        [],
      ),
    ).toBe(false);
  });
});

describe("hasProxyForwardingHeaders", () => {
  it("detects each forwarding header in single and array form", () => {
    expect(hasProxyForwardingHeaders(request("127.0.0.1"))).toBe(false);
    expect(hasProxyForwardingHeaders(request("127.0.0.1", { "x-forwarded-for": "10.0.0.1" }))).toBe(
      true,
    );
    expect(hasProxyForwardingHeaders(request("127.0.0.1", { forwarded: "for=10.0.0.1" }))).toBe(
      true,
    );
    expect(hasProxyForwardingHeaders(request("127.0.0.1", { "x-real-ip": "10.0.0.1" }))).toBe(true);
    expect(hasProxyForwardingHeaders(request("127.0.0.1", { "x-forwarded-for": ["a", "b"] }))).toBe(
      true,
    );
  });
});

describe("resolvedTrustedProxies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the explicit options list over the environment", () => {
    vi.stubEnv("PORACODE_REMOTE_TRUSTED_PROXIES", "10.0.0.0/8");
    expect(resolvedTrustedProxies({ trustedProxies: ["127.0.0.1"] })).toEqual(["127.0.0.1"]);
  });

  it("falls back to PORACODE_REMOTE_TRUSTED_PROXIES when options are unset", () => {
    vi.stubEnv("PORACODE_REMOTE_TRUSTED_PROXIES", "127.0.0.1, 10.0.0.0/8");
    expect(resolvedTrustedProxies({})).toEqual(["127.0.0.1", "10.0.0.0/8"]);
    expect(resolvedTrustedProxies({ trustedProxies: undefined })).toEqual([
      "127.0.0.1",
      "10.0.0.0/8",
    ]);
  });

  it("resolves to no proxies when neither options nor environment configure one", () => {
    vi.stubEnv("PORACODE_REMOTE_TRUSTED_PROXIES", "");
    expect(resolvedTrustedProxies({})).toEqual([]);
  });
});
