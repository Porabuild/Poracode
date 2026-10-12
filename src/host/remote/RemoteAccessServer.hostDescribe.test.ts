import { afterEach, describe, expect, it, vi } from "vitest";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";

vi.mock("@/host/db", () => ({
  dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetThreads: vi.fn<(...args: unknown[]) => unknown[]>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetState: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbSetState: vi.fn<(...args: unknown[]) => void>(),
}));

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

const DESKTOP_CAPS = hostServiceCapabilities({
  ssh: true,
  browserPanel: true,
  chromeBridge: true,
  computerUse: true,
  nativeSecrets: true,
  portForward: true,
  autoUpdate: true,
  osNotifications: true,
});

function createServer(options?: Partial<RemoteAccessServerOptions>): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-describe-test", label: "Describe Test" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    tls: null,
    ...options,
  });
  servers.push(server);
  return server;
}

async function issueToken(
  server: RemoteAccessServer,
  info: RemoteAccessServerInfo,
): Promise<string> {
  const pairingUrl = server.issueIndependentPairingUrl("Describe grant");
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      client: { label: "Describe client", deviceType: "browser" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

describe("GET /api/host/describe (V6 C.2)", () => {
  it("publishes host-declared capabilities to a session:read client", async () => {
    const server = createServer({ hostCapabilities: DESKTOP_CAPS });
    const info = await server.start();
    const token = await issueToken(server, info);
    const response = await fetch(new URL("/api/host/describe", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ capabilities: DESKTOP_CAPS });
  });

  it("fails closed to the unknown set when the host did not declare capabilities", async () => {
    const server = createServer();
    const info = await server.start();
    const token = await issueToken(server, info);
    const response = await fetch(new URL("/api/host/describe", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      capabilities: hostServiceCapabilities(),
    });
  });
});
