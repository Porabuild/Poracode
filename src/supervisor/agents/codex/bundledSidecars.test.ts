import { describe, expect, it } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import {
  buildCodexBundledSidecarCliArgs,
  buildCodexBundledSidecarThreadConfig,
  detectConfiguredCodexBundledSidecarsForPaths,
} from "./bundledSidecars";

describe("codex bundled sidecar suppression", () => {
  it("emits nothing on an empty config and disables detected desktop and CUA bundled plugins by default", () => {
    expect(buildCodexBundledSidecarThreadConfig({})).toEqual({});

    const config = buildCodexBundledSidecarThreadConfig({
      detected: {
        enabledPlugins: new Set([
          "codex-app-tools@openai-bundled",
          "unified-computer-use@openai-bundled",
          "computer-use@openai-bundled",
          "chrome@openai-bundled",
          "github@openai-curated",
        ]),
        hasNodeRepl: false,
      },
    });

    expect(config).toEqual({
      "plugins.codex-app-tools@openai-bundled": { enabled: false },
      "plugins.unified-computer-use@openai-bundled": { enabled: false },
      "plugins.computer-use@openai-bundled": { enabled: false },
      "plugins.chrome@openai-bundled": { enabled: false },
    });
    expect(config).not.toHaveProperty("plugins.github@openai-curated");
    expect(config).not.toHaveProperty("mcp_servers.node_repl");
  });

  it("disables configured native node_repl unless Poracode provides a user node_repl MCP server", () => {
    expect(
      buildCodexBundledSidecarThreadConfig({
        detected: { enabledPlugins: new Set(), hasNodeRepl: true },
      }),
    ).toMatchObject({
      "mcp_servers.node_repl": { enabled: false },
    });

    const userNodeRepl: ResolvedMcpServer = {
      id: "node_repl",
      name: "node_repl",
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: ["repl.mjs"], env: {} },
    };
    expect(
      buildCodexBundledSidecarThreadConfig({
        detected: { enabledPlugins: new Set(), hasNodeRepl: true },
        mcpServers: [userNodeRepl],
      }),
    ).not.toHaveProperty("mcp_servers.node_repl");
  });

  it("detects configured bundled sidecars from config.toml and emits minimal CLI overrides", async () => {
    const toml = `
[mcp_servers.node_repl]
enabled = true
command = "cua_node"

[plugins."unified-computer-use@openai-bundled"]
enabled = true

[plugins."codex-app-tools@openai-bundled"]
enabled = true
`;
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml"],
      {
        readTextFile: async () => toml,
      },
    );

    expect(detected.hasNodeRepl).toBe(true);
    expect([...detected.enabledPlugins].sort()).toEqual([
      "codex-app-tools@openai-bundled",
      "unified-computer-use@openai-bundled",
    ]);

    const cliArgs = buildCodexBundledSidecarCliArgs({ detected });
    expect(cliArgs).toEqual([
      "-c",
      'plugins."codex-app-tools@openai-bundled".enabled=false',
      "-c",
      'plugins."unified-computer-use@openai-bundled".enabled=false',
      "-c",
      "mcp_servers.node_repl.enabled=false",
    ]);
  });

  it.each([
    ["custom command", '[mcp_servers.node_repl]\ncommand = "node"\nargs = ["repl.mjs"]'],
    ["unknown commandless entry", "[mcp_servers.node_repl]\nenabled = true"],
    [
      "custom command with bundled-looking argument",
      '[mcp_servers.node_repl]\ncommand = "node"\nargs = ["/usr/bin/cua_node"]',
    ],
    ["remote transport", '[mcp_servers.node_repl]\nurl = "https://example.test/mcp"'],
    ["disabled bundled command", '[mcp_servers.node_repl]\nenabled = false\ncommand = "cua_node"'],
  ])("leaves a custom or disabled node_repl entry alone (%s)", async (_name, toml) => {
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml"],
      {
        readTextFile: async () => toml,
      },
    );

    expect(detected.hasNodeRepl).toBe(false);
    expect(buildCodexBundledSidecarCliArgs({ detected })).toEqual([]);
  });

  it("does not infer a bundled sidecar when its config is unreadable", () => {
    expect(buildCodexBundledSidecarThreadConfig()).toEqual({});
  });

  it("detects the enabled bundled CUA binary and preserves an injected custom native server", async () => {
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml"],
      {
        readTextFile: async () =>
          '[mcp_servers.node_repl]\ncommand = "C:\\\\Codex\\\\cua_node.exe"',
      },
    );

    expect(detected.hasNodeRepl).toBe(true);
    expect(
      buildCodexBundledSidecarCliArgs({
        detected,
        mcpServers: [
          {
            id: "node_repl",
            name: "node_repl",
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: ["custom.mjs"], env: {} },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("merges home and project node_repl config before identifying the effective command", async () => {
    const home = '[mcp_servers.node_repl]\ncommand = "custom-repl"';
    const project = "[mcp_servers.node_repl]\nenabled = true";
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml", "/project/.codex/config.toml"],
      {
        readTextFile: async (path) => (path === "/home/dev/.codex/config.toml" ? home : project),
      },
    );

    expect(detected.hasNodeRepl).toBe(false);
  });

  it("retains the bundled home command when the project layer only enables it", async () => {
    const home = '[mcp_servers.node_repl]\ncommand = "C:\\\\Codex\\\\cua_node.exe"';
    const project = "[mcp_servers.node_repl]\nenabled = true";
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml", "/project/.codex/config.toml"],
      {
        readTextFile: async (path) => (path === "/home/dev/.codex/config.toml" ? home : project),
      },
    );

    expect(detected.hasNodeRepl).toBe(true);
  });

  it("honors an explicit project-layer disable for the bundled home command", async () => {
    const home = '[mcp_servers.node_repl]\ncommand = "C:\\\\Codex\\\\cua_node.exe"';
    const project = "[mcp_servers.node_repl]\nenabled = false";
    const detected = await detectConfiguredCodexBundledSidecarsForPaths(
      ["/home/dev/.codex/config.toml", "/project/.codex/config.toml"],
      {
        readTextFile: async (path) => (path === "/home/dev/.codex/config.toml" ? home : project),
      },
    );

    expect(detected.hasNodeRepl).toBe(false);
  });
});
