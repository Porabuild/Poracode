import { describe, expect, it } from "vitest";
import {
  RELAY_LOOPBACK_HOP_HEADER,
  hasRelayLoopbackHopMarker,
  relayLoopbackHopSecret,
  resetRelayLoopbackHopSecretForTests,
  stripUnauthenticatedRelayHopMarker,
} from "./relayHopSecret";

describe("relay hop secret", () => {
  it("treats a literal 1 as unauthenticated and strips it", () => {
    resetRelayLoopbackHopSecretForTests();
    const headers = { [RELAY_LOOPBACK_HOP_HEADER]: "1" };
    expect(hasRelayLoopbackHopMarker({ headers })).toBe(false);
    stripUnauthenticatedRelayHopMarker(headers);
    expect(headers[RELAY_LOOPBACK_HOP_HEADER]).toBeUndefined();
  });

  it("keeps this process's secret and recognizes it", () => {
    resetRelayLoopbackHopSecretForTests();
    const secret = relayLoopbackHopSecret();
    const headers = { [RELAY_LOOPBACK_HOP_HEADER]: secret };
    expect(hasRelayLoopbackHopMarker({ headers })).toBe(true);
    stripUnauthenticatedRelayHopMarker(headers);
    expect(headers[RELAY_LOOPBACK_HOP_HEADER]).toBe(secret);
  });
});
