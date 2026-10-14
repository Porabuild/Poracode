import { describe, expect, it } from "vitest";
import { socketMatchesTrustedProxy } from "./trustedProxy";

describe("socketMatchesTrustedProxy", () => {
  it("matches exact addresses and IPv4-mapped forms", () => {
    expect(socketMatchesTrustedProxy("127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(socketMatchesTrustedProxy("::ffff:127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(socketMatchesTrustedProxy("192.0.2.1", ["127.0.0.1"])).toBe(false);
  });

  it("matches IPv4 and IPv6 CIDR ranges", () => {
    expect(socketMatchesTrustedProxy("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(socketMatchesTrustedProxy("11.0.0.1", ["10.0.0.0/8"])).toBe(false);
    expect(socketMatchesTrustedProxy("2001:db8::1", ["2001:db8::/32"])).toBe(true);
    expect(socketMatchesTrustedProxy("2001:db9::1", ["2001:db8::/32"])).toBe(false);
  });
});
