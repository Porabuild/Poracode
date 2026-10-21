import { describe, expect, it } from "vitest";
import { mcpServerSchema } from "@/shared/contracts/mcpServer";
import type { LoadedPlugin } from "@/shared/contracts/plugin";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL, EMPTY_PORACODE_EXTENSION } from "@/shared/plugins/spec";
import {
  inspectSavedMcpServer,
  summarizeMcpServer,
  summarizePluginInventory,
} from "./hostIntegrationInventory";

function plugin(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
  return {
    name: "fixture-plugin",
    source: "user",
    root: "/synthetic-private-root",
    manifest: {
      $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
      name: "fixture-plugin",
      version: "1.0.0",
    },
    poracode: { ...EMPTY_PORACODE_EXTENSION },
    skills: [{ folder: "fixture-skill", path: "/synthetic-private-skill" }],
    mcpServers: [
      {
        name: "fixture-server",
        entry: {
          type: "stdio",
          command: "synthetic-secret-command",
          args: ["synthetic-secret-argument"],
          env: { FIXTURE_KEY: "synthetic-secret-environment" },
        },
      },
    ],
    diagnostics: [
      {
        severity: "warning",
        scope: "mcp-server",
        code: "fixture",
        message: "synthetic-secret-diagnostic",
      },
    ],
    ...overrides,
  };
}

describe("public integration inventory", () => {
  it("keeps dropped-in user packages opt-in and omits raw package/configuration/diagnostic data", () => {
    const value = summarizePluginInventory([plugin()], {});
    expect(value).toEqual({
      formatVersion: 1,
      scope: "global",
      plugins: [
        {
          name: "fixture-plugin",
          version: "1.0.0",
          source: "user",
          installed: false,
          enabled: false,
          hostSupported: true,
          skillCount: 1,
          mcpServerNames: ["fixture-server"],
          errorCount: 0,
          warningCount: 1,
        },
      ],
    });
    expect(JSON.stringify(value)).not.toContain("synthetic-");
  });

  it("uses existing built-in/always-on policy without rewriting saved state or conflating OS support with enablement", () => {
    const installed = {
      "fixture-plugin": {
        version: "1.0.0",
        enabled: false,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    };
    const before = JSON.stringify(installed);
    const builtIn = plugin({
      source: "bundled",
      mcpServers: [],
      poracode: { ...EMPTY_PORACODE_EXTENSION, builtInMcpServerIds: ["browser"] },
    });
    expect(summarizePluginInventory([builtIn], {}).plugins[0]).toMatchObject({
      installed: true,
      enabled: true,
    });
    expect(summarizePluginInventory([builtIn], installed).plugins[0]).toMatchObject({
      installed: true,
      enabled: false,
    });
    const alwaysOn = {
      ...builtIn,
      poracode: {
        ...builtIn.poracode,
        alwaysEnabled: true,
        platforms: process.platform === "win32" ? ["linux" as const] : ["win32" as const],
      },
    };
    expect(summarizePluginInventory([alwaysOn], installed).plugins[0]).toMatchObject({
      installed: true,
      enabled: true,
      hostSupported: false,
    });
    expect(JSON.stringify(installed)).toBe(before);
  });

  it.each([
    {
      type: "stdio",
      command: "synthetic-secret-command",
      args: ["synthetic-secret-argument"],
      cwd: "/synthetic-private-cwd",
      env: { FIXTURE_KEY: "synthetic-secret-env" },
    },
    {
      type: "http",
      url: "https://fixture.test/synthetic-secret-path?token=synthetic-secret-query",
      headers: { Authorization: "synthetic-secret-header" },
    },
    {
      type: "sse",
      url: "https://fixture.test/synthetic-secret-path?token=synthetic-secret-query",
      headers: { Authorization: "synthetic-secret-header" },
    },
  ])("only returns names and public metadata for $type MCP configuration", (transport) => {
    const server = {
      ...mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        description: "synthetic-private-description",
        disabledTools: ["disabled-tool"],
        transport,
      }),
      secretReference: "synthetic-secret-reference",
    };
    const summary = summarizeMcpServer(server);
    expect(summary).toEqual({
      id: "exact-id",
      name: "fixture-server",
      enabled: true,
      transport: transport.type,
      timeoutMs: 30_000,
      disabledToolCount: 1,
    });
    const inspected = inspectSavedMcpServer([server], "exact-id");
    expect(inspected).toEqual({
      formatVersion: 1,
      scope: "saved-user",
      server: {
        ...summary,
        environmentNames: transport.type === "stdio" ? ["FIXTURE_KEY"] : [],
        headerNames: transport.type === "stdio" ? [] : ["Authorization"],
        disabledTools: ["disabled-tool"],
      },
    });
    expect(JSON.stringify([summary, inspected])).not.toContain("synthetic-");
    expect(JSON.stringify([summary, inspected])).not.toContain("secretReference");
  });

  it("requires a unique exact MCP ID without choosing a display name or the first duplicate", () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "fixture" },
    });
    expect(() => inspectSavedMcpServer([server], "fixture-server")).toThrow("use its exact ID");
    expect(() =>
      inspectSavedMcpServer([server, { ...server, name: "other-server" }], "exact-id"),
    ).toThrow("More than one");
    expect(() => inspectSavedMcpServer([], "exact-id")).toThrow("not found");
  });
});
