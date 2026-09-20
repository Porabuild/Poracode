import { describe, expect, it, vi } from "vitest";
import { UNKNOWN_HOST_SERVICE_CAPABILITIES } from "@/shared/hostControlProtocol";
import type { HostEventListener } from "./types";
import { RemoteHttpWsTransport } from "./remoteHttpWsTransport";

// V6 TIDY: `subscribeEvents` is a documented no-op on this flavor — the
// supervisor event stream is owned by the remote event sockets in
// `state/remoteServers`, not by the transport. Pin the contract: subscribing
// registers nothing and still yields a callable unsubscribe.
describe("RemoteHttpWsTransport.subscribeEvents", () => {
  it("registers nothing and returns a callable no-op unsubscribe", () => {
    const invoke = vi.fn<(name: string, args: unknown[]) => Promise<unknown>>();
    const transport = new RemoteHttpWsTransport(invoke, UNKNOWN_HOST_SERVICE_CAPABILITIES);
    const listener = vi.fn<HostEventListener>();

    const unsubscribe = transport.subscribeEvents(listener);

    expect(typeof unsubscribe).toBe("function");
    expect(listener).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();

    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
