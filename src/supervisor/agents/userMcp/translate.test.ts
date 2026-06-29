import { describe, it, expect } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  buildClaudeUserMcpServers,
  buildGeminiUserMcpServers,
  buildOpenCodeUserMcp,
  buildAcpUserMcpServers,
  buildCodexUserMcp,
  codexMcpTokenEnvVar,
} from "./translate";

const stdio: McpServer = {
  id: "1",
  name: "filesystem",
  enabled: true,
  transport: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    env: { FOO: "bar" },
  },
};

const http: McpServer = {
  id: "2",
  name: "ctx7",
  enabled: true,
  transport: {
    type: "http",
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer secret-token", "X-Extra": "1" },
  },
};

const sse: McpServer = {
  id: "3",
  name: "legacy",
  enabled: true,
  transport: { type: "sse", url: "https://sse.example.com/sse", headers: {} },
};

describe("buildClaudeUserMcpServers", () => {
  it("maps every transport into the SDK shape", () => {
    const out = buildClaudeUserMcpServers([stdio, http, sse]);
    expect(out.filesystem).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { FOO: "bar" },
    });
    expect(out.ctx7).toEqual({
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer secret-token", "X-Extra": "1" },
    });
    expect(out.legacy).toEqual({ type: "sse", url: "https://sse.example.com/sse", headers: {} });
  });
});

describe("buildGeminiUserMcpServers", () => {
  it("uses command for stdio, httpUrl for http, url for sse", () => {
    const out = buildGeminiUserMcpServers([stdio, http, sse]);
    expect(out.filesystem).toMatchObject({ command: "npx" });
    const ctx7 = out.ctx7!;
    expect(ctx7.httpUrl).toBe("https://mcp.example.com/mcp");
    expect(ctx7.url).toBeUndefined();
    const legacy = out.legacy!;
    expect(legacy.url).toBe("https://sse.example.com/sse");
    expect(legacy.httpUrl).toBeUndefined();
  });
});

describe("buildOpenCodeUserMcp", () => {
  it("maps stdio to local command array and remote for http/sse", () => {
    const out = buildOpenCodeUserMcp([stdio, http, sse]);
    expect(out.filesystem).toEqual({
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      environment: { FOO: "bar" },
      enabled: true,
    });
    expect(out.ctx7).toEqual({
      type: "remote",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer secret-token", "X-Extra": "1" },
      enabled: true,
    });
    expect(out.legacy).toEqual({
      type: "remote",
      url: "https://sse.example.com/sse",
      enabled: true,
    });
  });
});

describe("buildAcpUserMcpServers", () => {
  it("emits stdio without a type field and remote with type + header arrays", () => {
    const out = buildAcpUserMcpServers([stdio, http, sse]);
    expect(out[0]).toEqual({
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: [{ name: "FOO", value: "bar" }],
    });
    expect(out[1]).toEqual({
      type: "http",
      name: "ctx7",
      url: "https://mcp.example.com/mcp",
      headers: [
        { name: "Authorization", value: "Bearer secret-token" },
        { name: "X-Extra", value: "1" },
      ],
    });
    expect(out[2]).toMatchObject({
      type: "sse",
      name: "legacy",
      url: "https://sse.example.com/sse",
    });
  });
});

describe("buildCodexUserMcp", () => {
  it("serializes stdio command/args/env as TOML overrides", () => {
    const { args, env } = buildCodexUserMcp([stdio]);
    expect(args).toEqual([
      "-c",
      `mcp_servers.filesystem.command="npx"`,
      "-c",
      `mcp_servers.filesystem.args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`,
      "-c",
      `mcp_servers.filesystem.env={ "FOO" = "bar" }`,
    ]);
    expect(env).toEqual({});
  });

  it("enables the rmcp client once and routes bearer tokens through env", () => {
    const { args, env } = buildCodexUserMcp([http, sse]);
    expect(args.filter((a) => a === "experimental_use_rmcp_client=true")).toHaveLength(1);
    expect(args).toContain(`mcp_servers.ctx7.url="https://mcp.example.com/mcp"`);
    const tokenVar = codexMcpTokenEnvVar(http);
    expect(args).toContain(`mcp_servers.ctx7.bearer_token_env_var="${tokenVar}"`);
    expect(env[tokenVar]).toBe("secret-token");
    // sse server without auth still registers its url.
    expect(args).toContain(`mcp_servers.legacy.url="https://sse.example.com/sse"`);
  });

  it("quotes dotted server names as a single TOML key segment", () => {
    const server: McpServer = {
      ...http,
      id: "dot-id",
      name: "ctx.7",
    };
    const { args } = buildCodexUserMcp([server]);
    expect(args).toContain(`mcp_servers."ctx.7".url="https://mcp.example.com/mcp"`);
  });

  it("keeps bearer-token env vars unique after name normalization", () => {
    const first: McpServer = { ...http, id: "one", name: "foo-bar" };
    const second: McpServer = { ...http, id: "two", name: "foo_bar" };

    expect(codexMcpTokenEnvVar(first)).not.toBe(codexMcpTokenEnvVar(second));
  });

  it("does not treat non-Bearer Authorization headers as Codex bearer tokens", () => {
    const server: McpServer = {
      ...http,
      id: "basic-id",
      name: "basic",
      transport: {
        type: "http",
        url: "https://mcp.example.com/mcp",
        headers: { Authorization: "Basic abc123" },
      },
    };
    const { args, env } = buildCodexUserMcp([server]);

    expect(args.some((arg) => arg.startsWith("mcp_servers.basic.bearer_token_env_var"))).toBe(
      false,
    );
    expect(env).toEqual({});
  });
});
