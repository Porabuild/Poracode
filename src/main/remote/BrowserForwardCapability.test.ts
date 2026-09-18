import { describe, expect, it } from "vitest";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote";
import { RemoteAccessServer } from "./RemoteAccessServer";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";
import { PortProxy } from "./portForward/portProxy";

async function environment(withBrowserEntry: boolean) {
  const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
  const proxy = withBrowserEntry ? new PortProxy({ gateway }) : undefined;
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "capability-test", label: "Capability test" },
    host: "127.0.0.1",
    port: 0,
    portForward: gateway,
    ...(proxy ? { portProxy: proxy } : {}),
    callSupervisor: async () => "" as never,
  });
  try {
    const info = await server.start();
    const response = await fetch(new URL("/.well-known/poracode/environment", info.httpBaseUrl));
    expect(response.status).toBe(200);
    return {
      descriptor: (await response.json()) as RemoteEnvironmentDescriptor,
      availability: server.forwardOriginAvailability(),
    };
  } finally {
    gateway.dispose();
    proxy?.dispose();
    await server.dispose();
  }
}

describe("browser forwarding capability", () => {
  it("advertises entry protocol support independently of ingress configuration", async () => {
    const result = await environment(true);
    expect(result.descriptor.capabilities?.browserForward).toEqual({ versions: [1] });
    expect(result.availability.available).toBe(false);
  });

  it("does not infer browser support from the raw TCP gateway", async () => {
    const result = await environment(false);
    expect(result.descriptor.capabilities?.browserForward).toBeUndefined();
    expect(result.descriptor.auth.scopes).toContain("ports:forward");
  });
});
