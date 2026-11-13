import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { readCommandOutputAsync } from "@/supervisor/agents/base";
import { buildCodexAppServerCommand, buildCodexArgvFor } from "@/supervisor/agents/codex/argv";
import { readCodexNativeMcpNames } from "@/supervisor/agents/codex/nativeMcp";
import { buildCodexThreadOverrides } from "@/supervisor/agents/codex/threadOverrides";
import {
  CodexAppServerConnection,
  CodexAppServerRpc,
} from "@/supervisor/agents/codex/appServerRpc";
import { CodexStdioTransport } from "@/supervisor/agents/codex/stdioTransport";

// No credentials or model turns: exercise the installed CLI's real config
// merger against the HTTP table that survives an upgrade from older Poracode.
describe("Codex native MCP transport collision", () => {
  let root: string;
  let location: ProjectLocation;
  let env: Record<string, string>;
  const previousConfig = '[mcp_servers.custom-admin]\nurl="https://admin.test/mcp"\n';
  const servers: ResolvedMcpServer[] = [
    {
      id: "custom-admin",
      name: "custom-admin",
      timeoutMs: 1_000,
      transport: {
        type: "stdio",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        env: {},
      },
    },
  ];

  beforeEach(() => {
    mkdirSync(resolve("tmp"), { recursive: true });
    root = mkdtempSync(join(resolve("tmp"), "codex-mcp-"));
    location = { kind: process.platform === "win32" ? "windows" : "posix", path: root };
    env = { CODEX_HOME: root };
    writeFileSync(join(root, "config.toml"), previousConfig);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("loads terminal overrides without merging the proxy into native HTTP settings", async () => {
    const launch = await buildCodexArgvFor(
      location,
      { model: "" },
      "",
      undefined,
      { mcpServers: servers },
      env,
    );
    const result = await readCommandOutputAsync(
      launch.binary,
      ["mcp", "list", "--json", ...launch.args],
      { cwd: root, env: { ...launch.env, ...env } },
    );
    expect(result.ok).toBe(true);
    const entries = JSON.parse(result.stdout) as Array<{ name: string; enabled: boolean }>;
    expect(entries.find((entry) => entry.name === "custom-admin")?.enabled).toBe(false);
    expect(entries.filter((entry) => entry.enabled).map((entry) => entry.name)).toEqual([
      expect.stringMatching(/^poracode_custom-admin_/u),
    ]);
    expect(readFileSync(join(root, "config.toml"), "utf8")).toBe(previousConfig);
  });

  it("opens a structured Terra Max thread after reproducing the old failure", async () => {
    const nativeMcpNames = await readCodexNativeMcpNames(location, servers, env);
    const command = await buildCodexAppServerCommand(location, {
      mcpServers: servers,
      env,
      nativeMcpNames,
      includeMcpConfig: false,
    });
    const child = spawn(command.command, command.args, {
      cwd: root,
      env: { ...process.env, ...command.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
    const connection = new CodexAppServerConnection(new CodexStdioTransport(child));
    const rpc = new CodexAppServerRpc(connection, "mcp-regression");
    try {
      await rpc.request("initialize", {
        clientInfo: { name: "poracode-mcp-test", version: "1" },
        capabilities: null,
      });
      rpc.notify("initialized");
      const config = { model: "gpt-6.1-terra", effort: "max" };
      await expect(
        rpc.request("thread/start", {
          ...buildCodexThreadOverrides(config, { projectLocation: location, mcpServers: servers }),
          ephemeral: true,
        }),
      ).rejects.toThrow("url is not supported for stdio");
      const result = await rpc.request("thread/start", {
        ...buildCodexThreadOverrides(config, {
          projectLocation: location,
          mcpServers: servers,
          nativeMcpNames,
        }),
        ephemeral: true,
      });
      expect(result.thread.id).toBeTruthy();
      expect(readFileSync(join(root, "config.toml"), "utf8")).toBe(previousConfig);
    } finally {
      connection.dispose(new Error("Test complete"));
      await closed;
    }
  });
});
