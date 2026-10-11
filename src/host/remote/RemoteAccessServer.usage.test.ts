import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";

vi.mock("@/host/db", () => ({
  dbGetThreadRuntimeItem: vi.fn<() => null>(() => null),
  dbGetThreads: vi.fn<() => unknown[]>(() => []),
  dbGetThread: vi.fn<() => null>(() => null),
  dbGetProject: vi.fn<() => null>(() => null),
  dbGetState: vi.fn<() => null>(() => null),
  dbSetState: vi.fn<() => void>(),
}));

const servers: RemoteAccessServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

async function fixture(preset: "viewer" | "operator") {
  const usage = {
    snapshots: [
      {
        providerId: "provider:profile",
        authenticatedAs: "remote-account",
        status: "ok",
        windows: [],
        fetchedAt: 100,
      },
    ],
    fromCache: false,
  };
  const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
    async () => usage as never,
  );
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "usage-host", label: "Usage host" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    callSupervisor,
  });
  servers.push(server);
  const info = await server.start();
  const pairingUrl = server.issueIndependentPairingUrl("Usage fixture", { preset });
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      client: { label: "Usage fixture", deviceType: "browser" },
    }),
  });
  expect(response.status).toBe(200);
  const token = ((await response.json()) as { accessToken: string }).accessToken;
  const call = (
    procedure: string,
    bearer = token,
    protocolVersion: string | null = REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
  ) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
        ...(protocolVersion === null ? {} : { [REMOTE_PROTOCOL_VERSION_HEADER]: protocolVersion }),
      },
      body: JSON.stringify({
        procedure,
        payload: { providerIds: ["provider:profile"], force: true },
      }),
    });
  return { call, callSupervisor, usage, token };
}

describe("authenticated host-owned usage", () => {
  it("allows a viewer read but rejects live collection before invoking the supervisor", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    expect((await call("getProviderUsage")).status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("getProviderUsage", {
      providerIds: ["provider:profile"],
      force: true,
    });
    callSupervisor.mockClear();
    expect((await call("refreshProviderUsage")).status).toBe(403);
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("admits legacy cached reads but fences refresh at the current writer generation", async () => {
    const { call, callSupervisor, token } = await fixture("operator");
    expect((await call("getProviderUsage", token, null)).status).toBe(200);
    expect((await call("getProviderUsage", token, "12")).status).toBe(200);
    callSupervisor.mockClear();
    for (const generation of [null, "12"]) {
      const refused = await call("refreshProviderUsage", token, generation);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ error: { code: "protocol_version_mismatch" } });
    }
    expect(callSupervisor).not.toHaveBeenCalled();
    expect((await call("refreshProviderUsage", token)).status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledOnce();
  });

  it("forces collection on the host, returns its accounts, and rejects an invalid bearer", async () => {
    const { call, callSupervisor, usage } = await fixture("operator");
    const response = await call("refreshProviderUsage");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: usage });
    expect(callSupervisor).toHaveBeenCalledWith("refreshProviderUsage", {
      providerIds: ["provider:profile"],
      force: true,
    });
    callSupervisor.mockClear();
    expect((await call("refreshProviderUsage", "invalid-fixture")).status).toBe(401);
    expect(callSupervisor).not.toHaveBeenCalled();
  });
});
