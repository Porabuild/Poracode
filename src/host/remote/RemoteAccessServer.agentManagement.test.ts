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
  const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
    async () => ({}) as never,
  );
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "agent-management-host", label: "Agent management host" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    callSupervisor,
  });
  servers.push(server);
  const info = await server.start();
  const pairingUrl = server.issueIndependentPairingUrl("Agent management fixture", { preset });
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      client: { label: "Agent management fixture", deviceType: "browser" },
    }),
  });
  expect(response.status).toBe(200);
  const token = ((await response.json()) as { accessToken: string }).accessToken;
  const call = (procedure: string, payload: Record<string, unknown>, bearer = token) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearer}`,
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({ procedure, payload }),
    });
  return { call, callSupervisor };
}

describe("authenticated host agent management", () => {
  it("probes the addressed host's latest CLI agent version with a read-scoped token", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    const latest = { version: "2.5.0", source: "npm" };
    callSupervisor.mockResolvedValueOnce(latest as never);
    const response = await call("getLatestAgentVersion", { agentKind: "claude" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: latest });
    expect(callSupervisor).toHaveBeenCalledWith("getLatestAgentVersion", {
      agentKind: "claude",
    });
  });

  it("lists the addressed host's ACP registry for an operator", async () => {
    const { call, callSupervisor } = await fixture("operator");
    const registry = { version: "1", agents: [] };
    callSupervisor.mockResolvedValueOnce(registry as never);
    const response = await call("listAcpRegistry", {});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: registry });
    expect(callSupervisor).toHaveBeenCalledWith("listAcpRegistry", {});
  });

  it("rejects a viewer's registry listing by scope before invoking the supervisor", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    const response = await call("listAcpRegistry", {});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "missing_scope" } });
    expect(callSupervisor.mock.calls.some(([name]) => name === "listAcpRegistry")).toBe(false);
  });

  it("rejects a viewer's binary update by scope before invoking the supervisor", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    const response = await call("updateAgentBinary", {
      agentKind: "claude",
      envKind: "posix",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "missing_scope" } });
    expect(callSupervisor.mock.calls.some(([name]) => name === "updateAgentBinary")).toBe(false);
  });

  it.each([
    [
      "refreshAgentStatuses",
      { wslDistros: ["Ubuntu"] },
      { windows: [], wsl: [], fromCache: false },
    ],
    [
      "updateAgentBinary",
      { agentKind: "claude", envKind: "posix" },
      { ok: true, strategy: "npm-global" },
    ],
    ["installAcpRegistryAgent", { agentId: "registry-agent" }, { installed: [] }],
    ["removeAcpRegistryAgent", { agentId: "registry-agent" }, { installed: [] }],
    ["updateAcpRegistryAgent", { agentId: "registry-agent" }, { installed: [] }],
    [
      "setAcpRegistryAgentAuth",
      { agentId: "registry-agent", environment: { API_KEY: "secret" } },
      { installed: [] },
    ],
  ] as const)(
    "dispatches an operator's %s to the addressed host and returns its parsed result",
    async (procedure, payload, result) => {
      const { call, callSupervisor } = await fixture("operator");
      callSupervisor.mockResolvedValueOnce(result as never);
      const response = await call(procedure, payload);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ result });
      expect(callSupervisor).toHaveBeenCalledWith(procedure, payload);
    },
  );

  it.each([
    ["authenticateAcpAgent", { agentKind: "acp-generic:demo", methodId: "sso" }],
    ["logoutAcpAgent", { agentKind: "acp-generic:demo" }],
  ] as const)(
    "dispatches an operator's void %s to the addressed host",
    async (procedure, payload) => {
      const { call, callSupervisor } = await fixture("operator");
      callSupervisor.mockResolvedValueOnce(undefined as never);
      const response = await call(procedure, payload);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({});
      expect(callSupervisor).toHaveBeenCalledWith(procedure, payload);
    },
  );

  it("resolves provider account metadata for a viewer", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    const account = { account: { authenticatedAs: "user@example.com", plan: "Pro" } };
    callSupervisor.mockResolvedValueOnce(account as never);
    const response = await call("resolveAgentAccount", {
      agentKind: "antigravity",
      wslDistros: [],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: account });
  });

  it.each([
    ["installAcpRegistryAgent", { agentId: "registry-agent" }],
    ["removeAcpRegistryAgent", { agentId: "registry-agent" }],
    ["setAcpRegistryAgentAuth", { agentId: "registry-agent", environment: { KEY: "v" } }],
    ["authenticateAcpAgent", { agentKind: "acp-generic:demo", methodId: "sso" }],
    ["logoutAcpAgent", { agentKind: "acp-generic:demo" }],
  ] as const)(
    "rejects a viewer's %s by scope before invoking the supervisor",
    async (proc, payload) => {
      const { call, callSupervisor } = await fixture("viewer");
      const response = await call(proc, payload);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "missing_scope" } });
      expect(callSupervisor.mock.calls.some(([name]) => name === proc)).toBe(false);
    },
  );

  it("rejects viewer discovery before starting any provider probe", async () => {
    const { call, callSupervisor } = await fixture("viewer");
    const response = await call("refreshAgentStatuses", { wslDistros: [] });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "missing_scope" } });
    expect(callSupervisor.mock.calls.some(([name]) => name === "refreshAgentStatuses")).toBe(false);
  });
});
