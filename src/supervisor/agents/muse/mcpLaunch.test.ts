import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { buildMuseMspMcpServers, buildMuseTerminalMcpLaunch, museMcpServerName } from "./mcpLaunch";
import { createMuseAdapter } from "./index";
import { prepareMcpToolFilters } from "../../mcp/McpToolFilterService";

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

describe("Muse launch MCP translation", () => {
  it("preserves cwd-only stdio servers through preparation in both presentations", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-muse-mcp-"));
    writeFileSync(join(root, "mcp-stdio.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    try {
      const prepared = await prepareMcpToolFilters(
        [servers[0]!],
        { kind: "posix", path: "/project" },
        {
          proxyStdioCwd: createMuseAdapter().mcpRequiresStdioCwdProxy === true,
        },
      );
      const name = museMcpServerName(prepared[0]!);
      const msp = buildMuseMspMcpServers(prepared)[name]!;
      if (msp.transport !== "stdio") throw new Error("expected stdio");
      const envelope = msp.env!.PORACODE_MCP_STDIO_CONFIG!;
      expect(JSON.parse(Buffer.from(envelope, "base64url").toString("utf8"))).toEqual({
        version: 1,
        server: servers[0],
      });
      const terminal = buildMuseTerminalMcpLaunch(prepared);
      expect(Object.values(terminal.env)).toContain(envelope);
      expect(terminal.args.join(" ")).not.toContain(envelope);
      expect(terminal.args.join(" ")).not.toContain("/repo");
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("maps Muse MSP session MCP servers and skips the unsupported SSE transport", () => {
    const remote = servers[1]!;
    const authValue =
      remote.transport.type === "http" ? remote.transport.headers.Authorization : "";
    const localName = museMcpServerName(servers[0]!);
    expect(localName).toMatch(/^local_tools_[a-f0-9]{8}$/u);
    expect(buildMuseMspMcpServers(servers)).toEqual({
      [localName]: {
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { MODE: "test" },
        mode: "optional",
      },
      remote: {
        transport: "streamableHttp",
        url: "https://example.test/mcp",
        headers: { Authorization: authValue, "X-Test": "yes" },
        mode: "optional",
      },
    });
  });

  it("builds Muse terminal -c MCP flags with secrets carried through env", () => {
    const remote = servers[1]!;
    const authValue =
      remote.transport.type === "http" ? remote.transport.headers.Authorization : "";
    const localName = museMcpServerName(servers[0]!);
    const launch = buildMuseTerminalMcpLaunch(servers);
    const rendered = launch.args.join("\n");
    expect(rendered).not.toContain(authValue);
    expect(rendered).not.toContain('"MODE":"test"');
    expect(rendered).not.toContain("https://example.test/sse");

    const configFor = (name: string): Record<string, unknown> => {
      const flag = launch.args.find((arg) => arg.startsWith(`mcpServers.${name}=`));
      expect(flag).toBeDefined();
      return JSON.parse(flag!.slice(`mcpServers.${name}=`.length)) as Record<string, unknown>;
    };
    expect(launch.args.filter((arg) => arg === "-c")).toHaveLength(2);
    expect(configFor(localName)).toEqual({
      enabled: true,
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { MODE: expect.stringMatching(/^\$\{PORACODE_MCP_MUSE_/u) },
      mode: "optional",
    });
    expect(configFor("remote")).toEqual({
      enabled: true,
      transport: "streamable_http",
      url: "https://example.test/mcp",
      headers: {
        Authorization: expect.stringMatching(/^\$\{PORACODE_MCP_MUSE_/u),
        "X-Test": expect.stringMatching(/^\$\{PORACODE_MCP_MUSE_/u),
      },
      mode: "optional",
    });
    expect(Object.values(launch.env)).toEqual(expect.arrayContaining(["test", authValue, "yes"]));
  });

  it("keeps normalized Muse MCP names distinct", () => {
    const first = { id: "one", name: "plugin.server" };
    const second = { id: "two", name: "plugin_server" };

    expect(museMcpServerName(first)).toMatch(/^plugin_server_[a-f0-9]{8}$/u);
    expect(museMcpServerName(second)).toBe("plugin_server");
    expect(museMcpServerName(first)).not.toBe(museMcpServerName(second));
  });
});
