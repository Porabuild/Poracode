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

function harness(options: { global?: McpServer[]; project?: McpServer[] } = {}) {
  let settings: SharedSettings = {
    ...defaultSharedSettings,
    mcpServers: options.global ?? [secretServer],
  };
  let storedProject = project(options.project);
  const writes: string[] = [];
  const projectsChanged = vi.fn<() => void>();
  const dependencies: RemoteMcpSettingsGatewayDependencies = {
    readSettings: () => settings,
    writeGlobalServers: (servers) => {
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

  it("restores unchanged redaction markers while applying ordinary edits", () => {
    const state = harness();
    const redacted = state.gateway.read().servers[0]!;

    state.gateway.command({
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

  it("rejects redaction markers when creating a server with no stored secret", () => {
    const state = harness({ global: [] });
    expect(() =>
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
    ).toThrow("The MCP server change is invalid.");
    expect(state.settings().mcpServers).toEqual([]);
  });

  it("moves the unredacted server destination-first and emits project state", () => {
    const state = harness();

    const response = state.gateway.command({
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

  it("finishes an interrupted move when the destination already has the same id", () => {
    const state = harness({ project: [secretServer] });

    state.gateway.command({
      kind: "move",
      source: { kind: "global" },
      destination: { kind: "project", projectId: "project-1" },
      serverId: secretServer.id,
    });

    expect(state.writes).toEqual(["global"]);
    expect(state.project().mcpServers).toEqual([secretServer]);
    expect(state.settings().mcpServers).toEqual([]);
  });
});
