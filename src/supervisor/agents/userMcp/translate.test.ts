import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  buildAcpMcpServers,
  buildClaudeMcpServers,
  buildCodexMcp,
  buildCursorSdkMcpServers,
  buildGeminiMcpServers,
  buildOpenCodeMcp,
  buildOpenCodeMcpLaunchConfig,
  codexMcpTokenEnvVar,
} from "./translate";

const servers: McpServer[] = [
  {
    id: "stdio-id",
    name: "local.tools",
    description: "",
    enabled: true,
    timeoutMs: 45_000,
    transport: {
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { MODE: "test" },
      cwd: "/repo",
    },
  },
  {
    id: "remote-id",
    name: "remote",
    description: "",
    enabled: true,
    timeoutMs: 12_500,
    transport: {
      type: "http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer secret", "X-Test": "yes" },
    },
  },
  {
    id: "sse-id",
    name: "events",
    description: "",
    enabled: true,
    timeoutMs: 30_000,
    transport: { type: "sse", url: "https://example.test/sse", headers: {} },
  },
];

describe("custom MCP translators", () => {
  it("maps Claude, Cursor SDK, Gemini, OpenCode, and ACP transport shapes", () => {
    expect(buildClaudeMcpServers(servers)).toMatchObject({
      "local.tools": { type: "stdio", command: "node", timeout: 45_000 },
      remote: { type: "http", url: "https://example.test/mcp", timeout: 12_500 },
      events: { type: "sse", url: "https://example.test/sse" },
    });
    expect(buildCursorSdkMcpServers(servers)).toEqual({
      "local.tools": {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { MODE: "test" },
        cwd: "/repo",
      },
      remote: {
        type: "http",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer secret", "X-Test": "yes" },
      },
      events: { type: "sse", url: "https://example.test/sse" },
    });
    expect(buildGeminiMcpServers(servers)).toMatchObject({
      "local.tools": { command: "node", cwd: "/repo", timeout: 45_000 },
      remote: { httpUrl: "https://example.test/mcp", timeout: 12_500 },
      events: { url: "https://example.test/sse" },
    });
    expect(buildOpenCodeMcp(servers)).toMatchObject({
      "local.tools": {
        type: "local",
        command: ["node", "server.js"],
        cwd: "/repo",
        timeout: 45_000,
      },
      remote: { type: "remote", url: "https://example.test/mcp", timeout: 12_500 },
      events: { type: "remote", url: "https://example.test/sse" },
    });
    expect(buildAcpMcpServers(servers)).toEqual([
      {
        name: "local.tools",
        command: "node",
        args: ["server.js"],
        env: [{ name: "MODE", value: "test" }],
      },
      {
        type: "http",
        name: "remote",
        url: "https://example.test/mcp",
        headers: [
          { name: "Authorization", value: "Bearer secret" },
          { name: "X-Test", value: "yes" },
        ],
      },
      { type: "sse", name: "events", url: "https://example.test/sse", headers: [] },
    ]);
  });

  it("builds safe Codex overrides and carries bearer tokens through env", () => {
    const built = buildCodexMcp(servers);
    expect(built.args).toContain('mcp_servers."local.tools".command="node"');
    expect(built.args).toContain('mcp_servers."local.tools".tool_timeout_sec=45');
    expect(built.args).toContain('mcp_servers.remote.url="https://example.test/mcp"');
    expect(built.args).toContain("mcp_servers.remote.tool_timeout_sec=13");
    const envName = codexMcpTokenEnvVar(servers[1]!);
    expect(built.args).toContain(
      `mcp_servers.remote.bearer_token_env_var=${JSON.stringify(envName)}`,
    );
    expect(built.env).toMatchObject({ [envName]: "secret" });
    expect(Object.values(built.env)).toContain("yes");
    expect(built.args.some((arg) => arg.includes("env_http_headers"))).toBe(true);
  });

  it("projects generic approval policy metadata without inspecting the server name", () => {
    const built = buildCodexMcp([
      {
        id: "runtime-server",
        name: "runtime-server",
        timeoutMs: 300_000,
        approvalMode: "approve",
        transport: { type: "http", url: "https://example.test/mcp", headers: {} },
      },
    ]);

    expect(built.args).toContain(
      'mcp_servers.runtime-server.default_tools_approval_mode="approve"',
    );
  });

  it("keeps Codex credential env names distinct after label normalization", () => {
    const collidingLabels: McpServer[] = [
      {
        id: "same-id",
        name: "foo-bar",
        description: "",
        enabled: true,
        timeoutMs: 30_000,
        transport: {
          type: "http",
          url: "https://one.example/mcp",
          headers: { Authorization: "Bearer secret-one", "X-A": "header-one" },
        },
      },
      {
        id: "same-id",
        name: "foo_bar",
        description: "",
        enabled: true,
        timeoutMs: 30_000,
        transport: {
          type: "http",
          url: "https://two.example/mcp",
          headers: { Authorization: "Bearer secret-two", X_A: "header-two" },
        },
      },
    ];

    const built = buildCodexMcp(collidingLabels);
    const envEntries = Object.entries(built.env);
    const keyFor = (value: string) => envEntries.find((entry) => entry[1] === value)?.[0];

    expect(keyFor("secret-one")).toBeDefined();
    expect(keyFor("secret-two")).toBeDefined();
    expect(keyFor("secret-one")).not.toBe(keyFor("secret-two"));
    expect(keyFor("header-one")).not.toBe(keyFor("header-two"));
  });

  it("keeps OpenCode launch credentials out of the inline config", () => {
    const launch = buildOpenCodeMcpLaunchConfig(servers);
    const config = JSON.parse(launch.configContent) as {
      mcp: Record<
        string,
        { environment?: Record<string, string>; headers?: Record<string, string> }
      >;
    };

    expect(launch.configContent).not.toContain("Bearer secret");
    expect(launch.configContent).not.toContain('"MODE":"test"');
    expect(config.mcp["local.tools"]?.environment?.MODE).toMatch(/^\{env:PORACODE_MCP_/u);
    expect(config.mcp.remote?.headers?.Authorization).toMatch(/^\{env:PORACODE_MCP_/u);
    expect(Object.values(launch.env)).toEqual(
      expect.arrayContaining(["test", "Bearer secret", "yes"]),
    );
  });
});
