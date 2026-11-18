import { describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { McpServer, Project } from "@/shared/contracts";
import {
  createRemoteMcpSettingsGateway,
  type RemoteMcpSettingsGatewayDependencies,
} from "./RemoteMcpSettingsGateway";

const secretServer: McpServer = {
  id: "global-secret",
  name: "private_api",
  description: "Private API",
  enabled: true,
  timeoutMs: 30_000,
  transport: {
    type: "http",
    url: "https://example.test/mcp?token=url-secret",
    headers: { Authorization: "Bearer header-secret" },
  },
};

function project(servers: McpServer[] = []): Project {
  return {
    id: "project-1",
    name: "Project",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-08-22T00:00:00.000Z",
    mcpServers: servers,
  };
}

function harness(
  options: {
    global?: McpServer[];
    project?: McpServer[];
    beforeGlobalCommit?: () => Promise<void>;
  } = {},
) {
  let settings: SharedSettings = {
    ...defaultSharedSettings,
    mcpServers: options.global ?? [secretServer],
  };
  let storedProject = project(options.project);
  const writes: string[] = [];
  const projectsChanged = vi.fn<() => void>();
  const dependencies: RemoteMcpSettingsGatewayDependencies = {
    readSettings: () => settings,
    editGlobalServers: async (edit) => {
      await options.beforeGlobalCommit?.();
      const servers = edit(settings.mcpServers);
      writes.push("global");
      settings = { ...settings, mcpServers: servers };
    },
    readProject: (projectId) => (projectId === storedProject.id ? storedProject : undefined),
    writeProject: (next) => {
      writes.push("project");
      storedProject = next;
    },
    projectsChanged,
  };
  return {
    gateway: createRemoteMcpSettingsGateway(dependencies),
    settings: () => settings,
    project: () => storedProject,
    writes,
    projectsChanged,
  };
}

describe("RemoteMcpSettingsGateway", () => {
  it("redacts every credential-bearing value on reads", () => {
    const { gateway } = harness();
    const serialized = JSON.stringify(gateway.read());

    expect(serialized).not.toContain("url-secret");
    expect(serialized).not.toContain("header-secret");
    expect(serialized).toContain("«redacted»");
    expect(gateway.read().servers[0]?.transport).toMatchObject({
      type: "http",
      headers: { Authorization: "«redacted»" },
    });
  });

  it("resolves stored servers for host-owned operations without redacting them", () => {
    const { gateway } = harness();

    expect(gateway.resolveServer({ kind: "global" }, secretServer.id)).toEqual({
      server: secretServer,
    });
    expect(gateway.resolveScope({ kind: "project", projectId: "project-1" })).toEqual({
      servers: [],
      projectLocation: { kind: "posix", path: "/repo" },
    });
  });

  it("restores unchanged redaction markers while applying ordinary edits", async () => {
    const state = harness();
    const redacted = state.gateway.read().servers[0]!;

    await state.gateway.command({
      kind: "upsert",
      scope: { kind: "global" },
      server: { ...redacted, description: "Updated", enabled: false },
    });

    expect(state.settings().mcpServers[0]).toEqual({
      ...secretServer,
      description: "Updated",
      enabled: false,
    });
  });

  it("rejects redaction markers when creating a server with no stored secret", async () => {
    const state = harness({ global: [] });
    await expect(
      state.gateway.command({
        kind: "upsert",
        scope: { kind: "global" },
        server: {
          ...secretServer,
          transport: {
            type: "http",
            url: "https://example.test/mcp",
            headers: { Authorization: "«redacted»" },
          },
        },
      }),
    ).rejects.toThrow("The MCP server change is invalid.");
    expect(state.settings().mcpServers).toEqual([]);
  });

  it("preserves duplicate-name refusal and canonical defaults through the shared definition writer", async () => {
    const state = harness();
    await expect(
      state.gateway.command({
        kind: "upsert",
        scope: { kind: "global" },
        server: { ...secretServer, id: "another-id", name: "PRIVATE_API" },
      }),
    ).rejects.toThrow("The MCP server change is invalid.");
    expect(state.writes).toEqual([]);
    expect(state.settings().mcpServers).toEqual([secretServer]);
    await state.gateway.command({
      kind: "upsert",
      scope: { kind: "global" },
      server: {
        ...secretServer,
        id: "another-id",
        name: "another_server",
        transport: { type: "stdio", command: "fixture", args: [], env: {} },
      },
    });
    expect(state.settings().mcpServers[1]).toMatchObject({
      id: "another-id",
      name: "another_server",
      enabled: true,
      timeoutMs: 30_000,
    });
    expect(state.settings().mcpServers[0]).toEqual(secretServer);
  });

  it("moves the unredacted server destination-first and emits project state", async () => {
    const state = harness();

    const response = await state.gateway.command({
      kind: "move",
      source: { kind: "global" },
      destination: { kind: "project", projectId: "project-1" },
      serverId: secretServer.id,
    });

    expect(state.writes).toEqual(["project", "global"]);
    expect(state.project().mcpServers).toEqual([secretServer]);
    expect(state.settings().mcpServers).toEqual([]);
    expect(state.projectsChanged).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain("header-secret");
  });

  it("finishes an interrupted move when the destination already has the same id", async () => {
    const state = harness({ project: [secretServer] });

    await state.gateway.command({
      kind: "move",
      source: { kind: "global" },
      destination: { kind: "project", projectId: "project-1" },
      serverId: secretServer.id,
    });

    expect(state.writes).toEqual(["global"]);
    expect(state.project().mcpServers).toEqual([secretServer]);
    expect(state.settings().mcpServers).toEqual([]);
  });

  it("returns the committed, redacted list after a global write", async () => {
    const commit = Promise.withResolvers<void>();
    const { gateway } = harness({ global: [], beforeGlobalCommit: () => commit.promise });
    const result = gateway.command({
      kind: "upsert",
      scope: { kind: "global" },
      server: secretServer,
    });
    expect(gateway.read().servers).toEqual([]);
    commit.resolve();
    const response = await result;
    expect(response.servers.map((server) => server.id)).toEqual([secretServer.id]);
    expect(JSON.stringify(response)).not.toContain("header-secret");
  });

  it("keeps the project source if a global destination cannot commit", async () => {
    const { gateway, project: readProject } = harness({
      global: [],
      project: [secretServer],
      beforeGlobalCommit: () => Promise.reject(new Error("Write refused")),
    });
    await expect(
      gateway.command({
        kind: "move",
        source: { kind: "project", projectId: "project-1" },
        destination: { kind: "global" },
        serverId: secretServer.id,
      }),
    ).rejects.toThrow("Write refused");
    expect(readProject().mcpServers).toEqual([secretServer]);
  });
});
