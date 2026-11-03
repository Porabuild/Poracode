import { describe, expect, it, vi } from "vitest";
import type { McpServer, Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { mcpServerTools } from "./mcpServers";
import type { AppControlsSupervisorCaller, AppControlsToolContext } from "./types";

type SC = AppControlsSupervisorCaller;

function httpServer(id: string, name: string, token = `${id}-secret`): McpServer {
  return {
    id,
    name,
    description: "",
    enabled: true,
    timeoutMs: 30_000,
    transport: {
      type: "http",
      url: `https://${id}.example.test/mcp`,
      headers: { Authorization: `Bearer ${token}` },
    },
  };
}

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    location: { kind: "posix", path: `/work/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** In-memory owner: project and settings writes are visible to later reads. */
function harness(options: {
  globalServers?: McpServer[];
  projects?: Project[];
  callingProjectId?: string | null;
}) {
  let settings: SharedSettings = {
    ...defaultSharedSettings,
    mcpServers: options.globalServers ?? [],
  };
  const projects = new Map((options.projects ?? []).map((entry) => [entry.id, entry]));
  const callingProjectId = options.callingProjectId === undefined ? "p1" : options.callingProjectId;
  const thread = {
    id: "caller",
    projectId: callingProjectId ?? HOME_PROJECT_ID,
    agentKind: "claude",
  } as unknown as Thread;
  const supervisor = {
    probeMcpServer: vi.fn<SC["probeMcpServer"]>(async () => ({
      status: "available",
      toolCount: 0,
      latencyMs: 1,
      environment: { runtime: "host", projectScoped: false },
    })),
    reloadAgentMcpServers: vi.fn<SC["reloadAgentMcpServers"]>(async () => undefined),
    getMcpOauthStatus: vi.fn<SC["getMcpOauthStatus"]>(async () => ({ authenticatedUrls: [] })),
    beginMcpServerOauth: vi.fn<SC["beginMcpServerOauth"]>(async () => ({
      status: "redirect",
      flowId: "flow-1",
      authorizationUrl: "https://auth.example.test/authorize",
    })),
    waitMcpServerOauth: vi.fn<SC["waitMcpServerOauth"]>(async () => ({ status: "authorized" })),
    clearMcpServerOauth: vi.fn<SC["clearMcpServerOauth"]>(async () => undefined),
  };
  const updateProject = vi.fn<(next: Project) => void>((next) => {
    projects.set(next.id, next);
  });
  const settingsWrite = vi.fn<(next: SharedSettings) => void>((next) => {
    settings = next;
  });
  const ctx = {
    identity: { threadId: thread.id, title: "Caller" },
    getThread: (id: string) => (id === thread.id ? thread : null),
    getProject: (id: string) => projects.get(id) ?? null,
    updateProject,
    settings: { read: () => settings, write: settingsWrite },
    supervisor,
  } as unknown as AppControlsToolContext;
  const call = (name: string, args: Record<string, unknown> = {}) =>
    Promise.resolve(mcpServerTools.handlers[name]!(args, ctx)) as Promise<Record<string, unknown>>;
  return {
    call,
    supervisor,
    updateProject,
    settingsWrite,
    settings: () => settings,
    project: (id: string) => projects.get(id),
  };
}

describe("app-controls MCP server tools — project scope", () => {
  it("lists global and calling-project servers, flagging overrides and redacting secrets", async () => {
    const h = harness({
      globalServers: [httpServer("g1", "shared"), httpServer("g2", "global-only")],
      projects: [project("p1", { mcpServers: [httpServer("p-1", "shared")] })],
    });
    h.supervisor.getMcpOauthStatus.mockImplementation(async (payload) => ({
      authenticatedUrls: payload?.projectLocation ? ["https://p-1.example.test/mcp"] : [],
    }));

    const result = await h.call("list_mcp_servers");

    expect(result.project).toEqual({ id: "p1", name: "Project p1" });
    expect(result.servers).toEqual([
      expect.objectContaining({ id: "g1", scope: "global", overriddenByProject: true }),
      expect.objectContaining({ id: "g2", scope: "global", authenticated: false }),
      expect.objectContaining({
        id: "p-1",
        scope: "project",
        projectId: "p1",
        overridesGlobal: true,
        authenticated: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("lists only global servers for a Home caller", async () => {
    const h = harness({ globalServers: [httpServer("g1", "one")], callingProjectId: null });
    const result = await h.call("list_mcp_servers");
    expect(result.project).toBeUndefined();
    expect(result.count).toBe(1);
  });

  it("adds to the calling project with scope=project and keeps global settings untouched", async () => {
    const h = harness({
      globalServers: [httpServer("g1", "sentry")],
      projects: [project("p1")],
    });

    const result = await h.call("add_mcp_server", {
      scope: "project",
      server: { name: "sentry", transport: { type: "http", url: "https://mcp.sentry.dev/mcp" } },
    });

    expect(result.server).toEqual(
      expect.objectContaining({ name: "sentry", scope: "project", projectId: "p1" }),
    );
    expect(h.project("p1")?.mcpServers).toEqual([expect.objectContaining({ name: "sentry" })]);
    expect(h.settingsWrite).not.toHaveBeenCalled();
  });

  it("defaults add_mcp_server to global settings", async () => {
    const h = harness({ projects: [project("p1")] });
    await h.call("add_mcp_server", {
      server: { name: "docs", transport: { type: "http", url: "https://docs.example.test/mcp" } },
    });
    expect(h.settings().mcpServers.map((server) => server.name)).toEqual(["docs"]);
    expect(h.updateProject).not.toHaveBeenCalled();
  });

  it("rejects the Home project, unknown projects, and global scope with a projectId", async () => {
    const h = harness({ projects: [project("p1")] });
    const server = { name: "x", transport: { type: "http", url: "https://x.example.test/mcp" } };
    await expect(h.call("add_mcp_server", { server, projectId: HOME_PROJECT_ID })).rejects.toThrow(
      /Home project/,
    );
    await expect(h.call("add_mcp_server", { server, projectId: "missing" })).rejects.toThrow(
      /Project not found/,
    );
    await expect(
      h.call("add_mcp_server", { server, scope: "global", projectId: "p1" }),
    ).rejects.toThrow(/projectId applies only/);
    const home = harness({ callingProjectId: null });
    await expect(home.call("add_mcp_server", { server, scope: "project" })).rejects.toThrow(
      /needs a projectId/,
    );
  });

  it("rejects duplicate names within a project and redaction markers on add", async () => {
    const h = harness({ projects: [project("p1", { mcpServers: [httpServer("p-1", "dup")] })] });
    await expect(
      h.call("add_mcp_server", {
        projectId: "p1",
        server: { name: "DUP", transport: { type: "http", url: "https://d.example.test/mcp" } },
      }),
    ).rejects.toThrow(/already exists in project/);
    await expect(
      h.call("add_mcp_server", {
        projectId: "p1",
        server: {
          name: "fresh",
          transport: {
            type: "http",
            url: "https://f.example.test/mcp",
            headers: { Authorization: "«redacted»" },
          },
        },
      }),
    ).rejects.toThrow(/redacted/);
  });

  it("updates a project server found by id and restores an echoed redacted secret", async () => {
    const stored = httpServer("p-1", "api", "real-token");
    const h = harness({ projects: [project("p1", { mcpServers: [stored] })] });

    const result = await h.call("update_mcp_server", {
      id: "p-1",
      patch: {
        enabled: false,
        transport: {
          type: "http",
          url: stored.transport.type === "http" ? stored.transport.url : "",
          headers: { Authorization: "«redacted»" },
        },
      },
    });

    expect(result.server).toEqual(expect.objectContaining({ scope: "project", enabled: false }));
    const saved = h.project("p1")?.mcpServers?.[0];
    expect(saved?.enabled).toBe(false);
    expect(saved?.transport).toEqual(stored.transport);
  });

  it("removes from the explicitly named project only", async () => {
    const h = harness({
      projects: [
        project("p1", { mcpServers: [httpServer("p-1", "one")] }),
        project("p2", { mcpServers: [httpServer("p-2", "two")] }),
      ],
    });
    await expect(h.call("remove_mcp_server", { id: "p-2", projectId: "p1" })).rejects.toThrow(
      /Unknown MCP server id: p-2 in project "Project p1"/,
    );
    const result = await h.call("remove_mcp_server", { id: "p-2", projectId: "p2" });
    expect(result).toEqual(expect.objectContaining({ removed: true, projectId: "p2" }));
    expect(h.project("p2")?.mcpServers).toEqual([]);
    expect(h.project("p1")?.mcpServers).toHaveLength(1);
  });

  it("moves a global server into a project with its secrets, destination first", async () => {
    const server = httpServer("g1", "sentry", "keep-me");
    const h = harness({ globalServers: [server], projects: [project("p1")] });
    const order: string[] = [];
    h.updateProject.mockImplementation(() => order.push("destination"));
    h.settingsWrite.mockImplementation(() => order.push("source"));

    await h.call("move_mcp_server", { id: "g1", scope: "project" });

    expect(order).toEqual(["destination", "source"]);
    expect(h.updateProject.mock.calls[0]![0].mcpServers).toEqual([server]);
    expect(h.settingsWrite.mock.calls[0]![0].mcpServers).toEqual([]);
  });

  it("moves a project server to global and rejects same-scope or name conflicts", async () => {
    const h = harness({
      globalServers: [httpServer("g1", "taken")],
      projects: [
        project("p1", { mcpServers: [httpServer("p-1", "free"), httpServer("p-2", "taken")] }),
      ],
    });
    await expect(h.call("move_mcp_server", { id: "p-1", scope: "project" })).rejects.toThrow(
      /already in project/,
    );
    await expect(h.call("move_mcp_server", { id: "p-2", scope: "global" })).rejects.toThrow(
      /already has an MCP server named "taken"/,
    );
    await h.call("move_mcp_server", { id: "p-1", scope: "global" });
    expect(h.settings().mcpServers.map((entry) => entry.id)).toEqual(["g1", "p-1"]);
    expect(h.project("p1")?.mcpServers?.map((entry) => entry.id)).toEqual(["p-2"]);
  });

  it("refuses a move onto a different server with the same id and keeps the source", async () => {
    const source = httpServer("dup", "sentry", "source-secret");
    const h = harness({
      globalServers: [source],
      projects: [project("p1", { mcpServers: [httpServer("dup", "other", "other-secret")] })],
    });
    await expect(
      h.call("move_mcp_server", { id: "dup", scope: "project", fromScope: "global" }),
    ).rejects.toThrow(/different MCP server with id "dup"/);
    expect(h.settings().mcpServers).toEqual([source]);
    expect(h.updateProject).not.toHaveBeenCalled();
  });

  it("completes an interrupted move when the destination already holds the same server", async () => {
    const server = httpServer("g1", "sentry");
    const h = harness({
      globalServers: [server],
      projects: [project("p1", { mcpServers: [server] })],
    });
    await h.call("move_mcp_server", { id: "g1", scope: "project", fromScope: "global" });
    expect(h.settings().mcpServers).toEqual([]);
    expect(h.project("p1")?.mcpServers).toEqual([server]);
  });

  it("asks for a scope when an id exists both globally and in the calling project", async () => {
    const h = harness({
      globalServers: [httpServer("same", "global-one")],
      projects: [project("p1", { mcpServers: [httpServer("same", "project-one")] })],
    });
    await expect(h.call("remove_mcp_server", { id: "same" })).rejects.toThrow(/pass scope/);
    await h.call("remove_mcp_server", { id: "same", scope: "project" });
    expect(h.project("p1")?.mcpServers).toEqual([]);
    expect(h.settings().mcpServers).toHaveLength(1);
  });

  it("probes a saved project server in the project's runtime", async () => {
    const location = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/app",
      uncPath: String.raw`\\wsl.localhost\Ubuntu\home\me\app`,
    } as const;
    const stored = httpServer("p-1", "api");
    const h = harness({ projects: [project("p1", { location, mcpServers: [stored] })] });
    const result = await h.call("probe_mcp_server", { id: "p-1" });
    expect(h.supervisor.probeMcpServer).toHaveBeenCalledWith({
      server: stored,
      projectLocation: location,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("app-controls MCP server tools — OAuth", () => {
  it("begins sign-in in the project's token store and waits on the same flow", async () => {
    const location = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/app",
      uncPath: String.raw`\\wsl.localhost\Ubuntu\home\me\app`,
    } as const;
    const stored = httpServer("p-1", "sentry");
    const h = harness({ projects: [project("p1", { location, mcpServers: [stored] })] });

    const begin = await h.call("authenticate_mcp_server", { id: "p-1" });
    expect(begin).toEqual(
      expect.objectContaining({
        status: "redirect",
        flowId: "flow-1",
        authorizationUrl: "https://auth.example.test/authorize",
      }),
    );
    expect(h.supervisor.beginMcpServerOauth).toHaveBeenCalledWith({
      server: stored,
      projectLocation: location,
    });

    const wait = await h.call("authenticate_mcp_server", {
      action: "wait",
      flowId: "flow-1",
      projectId: "p1",
    });
    expect(wait).toEqual({ status: "authorized" });
    // The background wait started by begin is shared, not duplicated.
    expect(h.supervisor.waitMcpServerOauth).toHaveBeenCalledTimes(1);
    expect(h.supervisor.waitMcpServerOauth).toHaveBeenCalledWith({
      flowId: "flow-1",
      projectLocation: location,
    });
  });

  it("reports pending when the user has not finished within waitSeconds", async () => {
    vi.useFakeTimers();
    try {
      const h = harness({ projects: [project("p1")] });
      h.supervisor.waitMcpServerOauth.mockImplementation(() => new Promise(() => undefined));
      const pending = h.call("authenticate_mcp_server", {
        action: "wait",
        flowId: "flow-slow",
        waitSeconds: 2,
      });
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual(
        expect.objectContaining({ status: "pending", flowId: "flow-slow" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs out by endpoint URL and refuses stdio servers", async () => {
    const stdio: McpServer = {
      id: "s1",
      name: "local",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: [], env: {} },
    };
    const h = harness({ globalServers: [httpServer("g1", "remote"), stdio] });
    await h.call("authenticate_mcp_server", { action: "sign-out", id: "g1" });
    expect(h.supervisor.clearMcpServerOauth).toHaveBeenCalledWith({
      url: "https://g1.example.test/mcp",
    });
    await expect(h.call("authenticate_mcp_server", { id: "s1" })).rejects.toThrow(
      /only to HTTP\/SSE/,
    );
  });
});
