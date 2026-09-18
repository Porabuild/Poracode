import { afterEach, expect, it } from "vitest";
import { RemotePortForwardGateway } from "../RemotePortForwardGateway";
import { ForwardOriginPolicy } from "./forwardOrigin";
import { FORWARD_ORIGIN_SESSION_COOKIE_NAME, PortProxy } from "./portProxy";

const direct = { baseUrl: "https://direct.example.test", ownerId: "a".repeat(24) };
const relay = { baseUrl: "https://relay.example.test", ownerId: "b".repeat(24) };
const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
afterEach(() => gateway.dispose());

it("binds each ingress token, exchange and session to its selected origin", async () => {
  const forward = await gateway.startForward(3000);
  const proxy = new PortProxy({ gateway, forwardOrigin: direct });
  try {
    const directOrigin = new ForwardOriginPolicy(direct.baseUrl).originFor(
      direct.ownerId,
      forward.id,
    );
    const relayOrigin = new ForwardOriginPolicy(relay.baseUrl).originFor(relay.ownerId, forward.id);
    const directEntry = proxy.issueEnterToken(forward.id);
    const relayEntry = proxy.issueEnterToken(forward.id, relay);
    expect(proxy.beginExchange(forward.id, directEntry.token)?.childOrigin).toBe(directOrigin);
    const exchange = proxy.beginExchange(forward.id, relayEntry.token)!;
    expect(exchange.childOrigin).toBe(relayOrigin);
    const capability = new URL(exchange.exchangeUrl).searchParams.get("fx")!;
    expect(proxy.consumeExchangeCapability(forward.id, directOrigin, capability)).toBeNull();
    const session = proxy.consumeExchangeCapability(forward.id, relayOrigin, capability)!;
    const cookie = `${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=${session.sessionId}`;
    expect(
      proxy.resolveOriginSession(cookie, { forwardId: forward.id, origin: relayOrigin }),
    ).not.toBeNull();
    expect(
      proxy.resolveOriginSession(cookie, { forwardId: forward.id, origin: directOrigin }),
    ).toBeNull();
    const relayOnly = new PortProxy({ gateway });
    try {
      expect(relayOnly.forwardOriginAvailability().available).toBe(false);
      const entry = relayOnly.issueEnterToken(forward.id, relay);
      expect(relayOnly.beginExchange(forward.id, entry.token)?.childOrigin).toBe(relayOrigin);
    } finally {
      relayOnly.dispose();
    }
    expect(proxy.forwardOriginAvailability(null).available).toBe(false);
    const unavailableEntry = proxy.issueEnterToken(forward.id, null);
    expect(proxy.beginExchange(forward.id, unavailableEntry.token)).toBeNull();
  } finally {
    proxy.dispose();
  }
});
