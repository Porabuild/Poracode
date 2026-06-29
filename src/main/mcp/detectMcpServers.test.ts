import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { detectGlobalMcpServers, detectProjectMcpServers } from "./detectMcpServers";

function tmpProject(): string {
  return mkdtempSync(join(tmpdir(), "mcp-detect-"));
}

describe("detectProjectMcpServers", () => {
  it("parses .mcp.json stdio + http entries", () => {
    const dir = tmpProject();
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          fs: { command: "npx", args: ["-y", "server-fs"], env: { A: "1" }, cwd: "/repo" },
          remote: { type: "http", url: "https://x/mcp", headers: { Authorization: "Bearer t" } },
        },
      }),
    );
    const groups = detectProjectMcpServers(dir);
    const mcpJson = groups.find((g) => g.source === "mcp-json");
    expect(mcpJson).toBeDefined();
    const fs = mcpJson!.servers.find((s) => s.name === "fs");
    expect(fs?.transport).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "server-fs"],
      env: { A: "1" },
      cwd: "/repo",
    });
    const remote = mcpJson!.servers.find((s) => s.name === "remote");
    expect(remote?.transport).toEqual({
      type: "http",
      url: "https://x/mcp",
      headers: { Authorization: "Bearer t" },
    });
  });

  it("parses VS Code .vscode/mcp.json (servers key) and JSONC comments", () => {
    const dir = tmpProject();
    mkdirSync(join(dir, ".vscode"));
    writeFileSync(
      join(dir, ".vscode", "mcp.json"),
      `{
        // workspace MCP servers
        "servers": {
          "play": { "type": "stdio", "command": "node", "args": ["play.js"] }
        }
      }`,
    );
    const groups = detectProjectMcpServers(dir);
    const vscode = groups.find((g) => g.source === "vscode-project");
    expect(vscode?.servers[0]?.transport).toMatchObject({ type: "stdio", command: "node" });
  });

  it("parses opencode.json local + remote entries", () => {
    const dir = tmpProject();
    writeFileSync(
      join(dir, "opencode.json"),
      JSON.stringify({
        mcp: {
          local1: { type: "local", command: ["bun", "x", "srv"], environment: { K: "v" } },
          remote1: { type: "remote", url: "https://r/mcp", enabled: false },
        },
      }),
    );
    const groups = detectProjectMcpServers(dir);
    const oc = groups.find((g) => g.source === "opencode-project");
    const local1 = oc!.servers.find((s) => s.name === "local1");
    expect(local1?.transport).toEqual({
      type: "stdio",
      command: "bun",
      args: ["x", "srv"],
      env: { K: "v" },
    });
    const remote1 = oc!.servers.find((s) => s.name === "remote1");
    expect(remote1?.transport).toEqual({ type: "http", url: "https://r/mcp", headers: {} });
    expect(remote1?.disabled).toBe(true);
  });

  it("returns no groups when the project has no MCP config", () => {
    const dir = tmpProject();
    expect(detectProjectMcpServers(dir)).toEqual([]);
  });
});

describe("detectGlobalMcpServers", () => {
  it("parses quoted Codex MCP server table names", () => {
    const dir = tmpProject();
    const codexPath = join(dir, ".codex", "config.toml");
    mkdirSync(join(dir, ".codex"));
    writeFileSync(
      codexPath,
      `
        [mcp_servers."ctx.7"]
        url = "https://mcp.example.com/mcp"
      `,
    );

    const groups = detectGlobalMcpServers(undefined, dir);
    const codex = groups.find((g) => g.source === "codex-global");
    expect(codex?.servers[0]).toMatchObject({
      name: "ctx.7",
      transport: { type: "http", url: "https://mcp.example.com/mcp", headers: {} },
    });
  });
});
