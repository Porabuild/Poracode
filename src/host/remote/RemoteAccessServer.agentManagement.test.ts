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

async function fixture(
  preset: "viewer" | "operator",
  settings?: RemoteAccessServerOptions["settings"],
) {
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
    ...(settings ? { settings } : {}),
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
  return { call, callSupervisor, httpBaseUrl: info.httpBaseUrl, token };
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
    [
      "applyNativeMcpSetup",
      {
        agentKind: "opencode",
        env: { kind: "native" },
        revision: "rev-1",
        installIds: ["mcp-1"],
        removeNames: [],
      },
      {
        supported: true,
        revision: "rev-2",
        candidates: [
          {
            id: "mcp-1",
            name: "poracode",
            target: "stdio",
            eligible: true,
            conflict: false,
            installed: true,
          },
        ],
        installedNames: ["poracode"],
        modifiedNames: [],
      },
    ],
    [
      "installAgentHookPlugin",
      { agentKind: "opencode", env: { kind: "native" } },
      {
        status: {
          agentKind: "opencode",
          env: { kind: "native" },
          supported: true,
          installed: true,
          version: "1.0.0",
          bundledVersion: "1.0.0",
          canUninstall: true,
        },
      },
    ],
    [
      "uninstallAgentHookPlugin",
      { agentKind: "opencode", env: { kind: "native" } },
      {
        status: {
          agentKind: "opencode",
          env: { kind: "native" },
          supported: true,
          installed: false,
          bundledVersion: "1.0.0",
          canUninstall: true,
        },
      },
    ],
    [
      "manageAgentPlugins",
      { agentKind: "opencode", env: { kind: "native" }, action: "list" },
      {
        packages: [
          {
            target: "@prevalentware/opencode-goal-plugin",
            status: "active",
            outdated: false,
            server: true,
            terminal: true,
          },
        ],
      },
    ],
    [
      "manageAgentCredentials",
      {
        agentKind: "opencode",
        env: { kind: "native" },
        action: "remove",
        credentialId: "cred_1",
      },
      { providers: [] },
    ],
    [
      "manageModelProviders",
      { agentKind: "deepseek", env: { kind: "native" }, action: "list" },
      { ok: true, revision: "rev-1", catalog: [], providers: [] },
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
    ["reloadAgentMcpServers", { agentKind: "opencode" }],
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
    [
      "getAgentConfigDefaults",
      { agentKind: "codex" },
      { defaults: { planModeReasoningEffort: "high" } },
    ],
    [
      "getNativeMcpSetup",
      { agentKind: "opencode", env: { kind: "native" } },
      { supported: true, candidates: [], installedNames: [], modifiedNames: [] },
    ],
    [
      "getAgentHookPluginStatuses",
      { agentKind: "opencode", envs: [{ kind: "native" }] },
      [
        {
          agentKind: "opencode",
          env: { kind: "native" },
          supported: true,
          installed: false,
          bundledVersion: "1.0.0",
          canUninstall: true,
        },
      ],
    ],
  ] as const)(
    "reads %s from the addressed host with a viewer token",
    async (procedure, payload, result) => {
      const { call, callSupervisor } = await fixture("viewer");
      callSupervisor.mockResolvedValueOnce(result as never);
      const response = await call(procedure, payload);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ result });
      expect(callSupervisor).toHaveBeenCalledWith(procedure, payload);
    },
  );

  it.each([
    ["installAcpRegistryAgent", { agentId: "registry-agent" }],
    ["removeAcpRegistryAgent", { agentId: "registry-agent" }],
    ["setAcpRegistryAgentAuth", { agentId: "registry-agent", environment: { KEY: "v" } }],
    ["authenticateAcpAgent", { agentKind: "acp-generic:demo", methodId: "sso" }],
    ["logoutAcpAgent", { agentKind: "acp-generic:demo" }],
    [
      "applyNativeMcpSetup",
      {
        agentKind: "opencode",
        env: { kind: "native" },
        revision: "rev-1",
        installIds: ["mcp-1"],
        removeNames: [],
      },
    ],
    ["reloadAgentMcpServers", { agentKind: "opencode" }],
    ["installAgentHookPlugin", { agentKind: "opencode", env: { kind: "native" } }],
    ["uninstallAgentHookPlugin", { agentKind: "opencode", env: { kind: "native" } }],
    ["manageAgentPlugins", { agentKind: "opencode", env: { kind: "native" }, action: "list" }],
    ["manageAgentCredentials", { agentKind: "opencode", env: { kind: "native" }, action: "list" }],
    ["manageModelProviders", { agentKind: "deepseek", env: { kind: "native" }, action: "list" }],
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

  it.each([
    ["manageAgentPlugins", { agentKind: "opencode", env: { kind: "native" }, action: "install" }],
    [
      "manageAgentCredentials",
      { agentKind: "opencode", env: { kind: "native" }, action: "remove" },
    ],
    [
      "manageModelProviders",
      {
        agentKind: "deepseek",
        env: { kind: "native" },
        action: "save",
        create: true,
        revision: "rev-1",
        provider: {
          id: "__proto__",
          name: "Bad",
          baseURL: "https://example.com",
          protocol: "openai-completions",
          modelIds: [],
        },
      },
    ],
    [
      "manageModelProviders",
      {
        agentKind: "deepseek",
        env: { kind: "native" },
        action: "save",
        create: true,
        revision: "rev-1",
        provider: {
          id: "acme",
          name: "Credentialed URL",
          baseURL: "https://user:pass@example.com/v1",
          protocol: "openai-completions",
          modelIds: [],
        },
      },
    ],
  ] as const)(
    "rejects malformed %s payloads before invoking the supervisor",
    async (proc, payload) => {
      const { call, callSupervisor } = await fixture("operator");
      const response = await call(proc, payload);
      expect(response.status).toBe(400);
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

  it("enforces scopes and dispatches agent-profiles-read and agent-profiles-command", async () => {
    const readAgentProfiles = vi.fn<
      NonNullable<NonNullable<RemoteAccessServerOptions["settings"]>["readAgentProfiles"]>
    >(() => ({
      profiles: {
        work: {
          id: "work",
          driver: "codex",
          displayName: "Work",
          config: { homeDir: "~/.codex-work" },
        },
      },
    }));
    const commandAgentProfiles = vi.fn<
      NonNullable<NonNullable<RemoteAccessServerOptions["settings"]>["commandAgentProfiles"]>
    >(async () => ({
      profiles: {
        work: {
          id: "work",
          driver: "codex",
          displayName: "Work Renamed",
          config: { homeDir: "~/.codex-work" },
        },
      },
      instance: {
        id: "work",
        driver: "codex",
        displayName: "Work Renamed",
        config: { homeDir: "~/.codex-work" },
      },
    }));
    const settingsGateway = {
      read: () => ({}) as never,
      update: async () => ({}) as never,
      readMcpServers: () => ({ servers: {} }),
      commandMcpServers: async () => ({ servers: {} }),
      resolveScope: () => undefined,
      resolveServer: () => undefined,
      readAgentProfiles,
      commandAgentProfiles,
    } as unknown as NonNullable<RemoteAccessServerOptions["settings"]>;

    const viewer = await fixture("viewer", settingsGateway);
    const viewerRead = await fetch(new URL("/api/settings/agent-profiles", viewer.httpBaseUrl), {
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    expect(viewerRead.status).toBe(200);
    await expect(viewerRead.json()).resolves.toEqual(readAgentProfiles());

    const viewerWrite = await fetch(
      new URL("/api/settings/agent-profiles/command", viewer.httpBaseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${viewer.token}`,
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify({
          kind: "update",
          instanceId: "work",
          displayName: "Work Renamed",
        }),
      },
    );
    expect(viewerWrite.status).toBe(403);
    expect(commandAgentProfiles).not.toHaveBeenCalled();

    const operator = await fixture("operator", settingsGateway);
    const opWrite = await fetch(
      new URL("/api/settings/agent-profiles/command", operator.httpBaseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${operator.token}`,
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify({
          kind: "update",
          instanceId: "work",
          displayName: "Work Renamed",
        }),
      },
    );
    expect(opWrite.status).toBe(200);
    expect(commandAgentProfiles).toHaveBeenCalledWith({
      kind: "update",
      instanceId: "work",
      displayName: "Work Renamed",
    });

    const unconfigured = await fixture("operator");
    const unavailable = await fetch(
      new URL("/api/settings/agent-profiles", unconfigured.httpBaseUrl),
      { headers: { authorization: `Bearer ${unconfigured.token}` } },
    );
    expect(unavailable.status).toBe(503);
  });
});
