import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  AGENT_PLUGINS_MCP_SCHEMA_URL,
} from "@/shared/plugins/spec";
import { pluginMcpServerId } from "@/shared/plugins/catalog";
import { PluginRegistry } from "./PluginRegistry";
import { PluginAccountService } from "./PluginAccountService";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "poracode-plugin-accounts-"));
  roots.push(root);
  const user = join(root, "plugins");
  for (const name of ["notes", "calendar"]) {
    const directory = join(user, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "plugin.json"),
      JSON.stringify({ $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name }),
    );
    writeFileSync(
      join(directory, "mcp.json"),
      JSON.stringify({
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { service: { type: "streamable-http", url: " https://example.org/mcp " } },
      }),
    );
  }
  const tokens = new Map<string, string>([["https://example.org/mcp", "legacy-url-token"]]);
  const oauth = {
    beginForCredential: async (_server: McpServer, key?: string) => {
      tokens.set(key!, `secret-${key}`);
      return { status: "authorized" as const };
    },
    credentialStatus: (key: string) => ({
      status: tokens.has(key) ? ("connected" as const) : ("disconnected" as const),
      scopes: tokens.has(key) ? ["notes:read"] : [],
    }),
    clearCredential: (key: string) => {
      tokens.delete(key);
    },
    applyAuthorizationToServer: async (server: McpServer, key?: string) =>
      server.transport.type === "stdio" || !tokens.has(key ?? server.transport.url)
        ? server
        : {
            ...server,
            transport: {
              ...server.transport,
              headers: { Authorization: `Bearer ${tokens.get(key ?? server.transport.url)}` },
            },
          },
  };
  const registry = new PluginRegistry({
    bundledPluginsDir: () => undefined,
    userPluginsDir: () => user,
  });
  const service = new PluginAccountService({ baseDir: root, registry, oauth });
  const server = (name: string): McpServer => ({
    id: pluginMcpServerId(name, "service"),
    name: `${name}.service`,
    description: "",
    enabled: true,
    timeoutMs: 30_000,
    transport: { type: "http", url: "https://example.org/mcp", headers: {} },
  });
  return { root, user, tokens, service, server, oauth, registry };
}

describe("plugin service accounts", () => {
  it("uses current package-managed headers without changing saved OAuth accounts or credentials", async () => {
    const { root, user, service, server, tokens, registry } = setup();
    const first = await service.manage({
      action: "begin",
      pluginName: "notes",
      serverName: "service",
      label: "Work",
    });
    const personal = await service.manage({
      action: "begin",
      pluginName: "notes",
      serverName: "service",
      label: "Personal",
    });
    await service.manage({
      action: "logout",
      pluginName: "notes",
      serverName: "service",
      accountId: first.accountId!,
    });
    expect(await service.applyAuthorizationToServer(server("notes"))).toBeUndefined();
    const metadata = readFileSync(join(root, "plugin-accounts.json"), "utf8");
    const credentials = [...tokens];
    writeFileSync(
      join(user, "notes", "mcp.json"),
      JSON.stringify({
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: {
          service: {
            type: "streamable-http",
            url: "https://example.org/mcp",
            headers: { authorization: "Bearer package-managed" },
          },
        },
      }),
    );
    registry.refresh();
    const managed: McpServer = {
      ...server("notes"),
      transport: {
        type: "http",
        url: "https://example.org/mcp",
        headers: { authorization: "Bearer package-managed" },
      },
    };
    expect(await service.applyAuthorizationToServer(managed)).toBe(managed);
    await expect(
      service.manage({
        action: "begin",
        pluginName: "notes",
        serverName: "service",
        label: "Unused",
      }),
    ).rejects.toThrow("supplies its own authorization");
    expect(readFileSync(join(root, "plugin-accounts.json"), "utf8")).toBe(metadata);
    expect([...tokens]).toEqual(credentials);
    expect((await service.manage({ action: "list", pluginName: "notes" })).accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: personal.accountId, status: "connected" }),
      ]),
    );
    writeFileSync(
      join(user, "notes", "mcp.json"),
      JSON.stringify({
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { service: { type: "streamable-http", url: "https://example.org/mcp" } },
      }),
    );
    registry.refresh();
    expect(await service.applyAuthorizationToServer(server("notes"))).toBeUndefined();
    await service.manage({
      action: "select",
      pluginName: "notes",
      serverName: "service",
      accountId: personal.accountId!,
    });
    expect((await service.applyAuthorizationToServer(server("notes")))?.transport).toMatchObject({
      headers: { Authorization: expect.stringContaining("Bearer secret-") },
    });
  });

  it("isolates plugins and accounts using the same URL, and never falls back after logout", async () => {
    const { service, server, tokens, root } = setup();
    const publicServer = await service.applyAuthorizationToServer(server("notes"));
    expect(publicServer?.transport).toMatchObject({ headers: {} });
    const first = await service.manage({
      action: "begin",
      pluginName: "notes",
      serverName: "service",
      label: "Work",
    });
    const other = await service.manage({
      action: "begin",
      pluginName: "calendar",
      serverName: "service",
      label: "Calendar",
    });
    const personal = await service.manage({
      action: "begin",
      pluginName: "notes",
      serverName: "service",
      label: "Personal",
    });
    expect(first.accounts[0]).toMatchObject({
      label: "Work",
      selected: true,
      status: "connected",
      scopes: ["notes:read"],
    });
    await service.manage({
      action: "select",
      pluginName: "notes",
      serverName: "service",
      accountId: personal.accountId!,
    });
    const notesAuthorized = await service.applyAuthorizationToServer(server("notes"));
    const calendarAuthorized = await service.applyAuthorizationToServer(server("calendar"));
    expect(notesAuthorized?.transport).not.toEqual(calendarAuthorized?.transport);
    await service.manage({
      action: "logout",
      pluginName: "notes",
      serverName: "service",
      accountId: personal.accountId!,
    });
    expect(await service.applyAuthorizationToServer(server("notes"))).toBeUndefined();
    expect(
      (await service.manage({ action: "list", pluginName: "calendar" })).accounts[0]?.status,
    ).toBe("connected");
    expect(tokens.get("https://example.org/mcp")).toBe("legacy-url-token");
    expect(readFileSync(join(root, "plugin-accounts.json"), "utf8")).not.toContain("secret-");
    expect(JSON.stringify(other)).not.toContain("secret-");
    await expect(
      service.manage({
        action: "select",
        pluginName: "calendar",
        serverName: "service",
        accountId: first.accountId!,
      }),
    ).rejects.toThrow("not found");
  });

  it("removes only the selected plugin credentials and refuses future metadata versions", async () => {
    const { root, service } = setup();
    await service.manage({
      action: "begin",
      pluginName: "notes",
      serverName: "service",
      label: "Work",
    });
    await service.manage({
      action: "begin",
      pluginName: "calendar",
      serverName: "service",
      label: "Calendar",
    });
    service.removePluginAccounts("notes");
    expect((await service.manage({ action: "list", pluginName: "notes" })).accounts).toEqual([]);
    expect(
      (await service.manage({ action: "list", pluginName: "calendar" })).accounts[0]?.status,
    ).toBe("connected");
    const future = JSON.stringify({ version: 99, accounts: [] });
    writeFileSync(join(root, "plugin-accounts.json"), future);
    await expect(
      service.manage({
        action: "begin",
        pluginName: "notes",
        serverName: "service",
        label: "Work",
      }),
    ).rejects.toThrow(/version/u);
    expect(readFileSync(join(root, "plugin-accounts.json"), "utf8")).toBe(future);
  });
});
