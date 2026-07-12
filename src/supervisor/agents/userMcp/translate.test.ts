import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  buildAcpUserMcpServers,
  buildClaudeUserMcpServers,
  buildCodexUserMcp,
  buildGeminiUserMcpServers,
  buildOpenCodeUserMcp,
  buildOpenCodeUserMcpLaunchConfig,
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
  it("maps Claude, Gemini, OpenCode, and ACP transport shapes", () => {
    expect(buildClaudeUserMcpServers(servers)).toMatchObject({
      "local.tools": { type: "stdio", command: "node", timeout: 45_000 },
      remote: { type: "http", url: "https://example.test/mcp", timeout: 12_500 },
      events: { type: "sse", url: "https://example.test/sse" },
    });
    expect(buildGeminiUserMcpServers(servers)).toMatchObject({
      "local.tools": { command: "node", cwd: "/repo", timeout: 45_000 },
      remote: { httpUrl: "https://example.test/mcp", timeout: 12_500 },
      events: { url: "https://example.test/sse" },
    });
    expect(buildOpenCodeUserMcp(servers)).toMatchObject({
      "local.tools": {
        type: "local",
        command: ["node", "server.js"],
        cwd: "/repo",
        timeout: 45_000,
      },
      remote: { type: "remote", url: "https://example.test/mcp", timeout: 12_500 },
      events: { type: "remote", url: "https://example.test/sse" },
    });
    expect(buildAcpUserMcpServers(servers)).toEqual([
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
    const built = buildCodexUserMcp(servers);
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

    const built = buildCodexUserMcp(collidingLabels);
    const envEntries = Object.entries(built.env);
    const keyFor = (value: string) => envEntries.find((entry) => entry[1] === value)?.[0];

    expect(keyFor("secret-one")).toBeDefined();
    expect(keyFor("secret-two")).toBeDefined();
    expect(keyFor("secret-one")).not.toBe(keyFor("secret-two"));
    expect(keyFor("header-one")).not.toBe(keyFor("header-two"));
  });

  it("keeps OpenCode launch credentials out of the inline config", () => {
    const launch = buildOpenCodeUserMcpLaunchConfig(servers);
    const config = JSON.parse(launch.configContent) as {
      mcp: Record<
        string,
        { environment?: Record<string, string>; headers?: Record<string, string> }
      >;
    };

    expect(launch.configContent).not.toContain("Bearer secret");
    expect(launch.configContent).not.toContain('"MODE":"test"');
    expect(config.mcp["local.tools"]?.environment?.MODE).toMatch(/^\{env:LIGHTCODE_MCP_/u);
    expect(config.mcp.remote?.headers?.Authorization).toMatch(/^\{env:LIGHTCODE_MCP_/u);
    expect(Object.values(launch.env)).toEqual(
      expect.arrayContaining(["test", "Bearer secret", "yes"]),
    );
  });
});
