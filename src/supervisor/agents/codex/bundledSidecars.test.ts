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

  it("honors allowBundledCuaSidecars opt-in while still suppressing codex-app-tools", () => {
    const config = buildCodexBundledSidecarThreadConfig({
      detected: {
        enabledPlugins: new Set([
          "codex-app-tools@openai-bundled",
          "unified-computer-use@openai-bundled",
          "computer-use@openai-bundled",
          "chrome@openai-bundled",
        ]),
        hasNodeRepl: true,
      },
      agentSettings: { allowBundledCuaSidecars: true },
    });

    expect(config).toEqual({
      "plugins.codex-app-tools@openai-bundled": { enabled: false },
    });
  });

  it("detects configured bundled sidecars from config.toml and emits minimal CLI overrides", async () => {
    const toml = `
[mcp_servers.node_repl]
enabled = true

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
});
