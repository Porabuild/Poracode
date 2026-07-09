import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";
import {
  getGeminiPluginPaths,
  installGeminiPlugin,
  isGeminiPluginInstalled,
  renderGeminiSettings,
  syncGeminiBrowserMcpSettings,
  syncGeminiSubagentMcpSettings,
} from "./install";

const tempDirs: string[] = [];
let savedBrowserMcpEnv: { url?: string; token?: string };

function makeBaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-gemini-plugin-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  // The install path bakes a browser MCP entry from these env vars when set.
  // Clear them so mcpServers assertions are deterministic in CI/dev shells.
  savedBrowserMcpEnv = {
    ...(process.env.LIGHTCODE_BROWSER_MCP_URL !== undefined
      ? { url: process.env.LIGHTCODE_BROWSER_MCP_URL }
      : {}),
    ...(process.env.LIGHTCODE_BROWSER_MCP_TOKEN !== undefined
      ? { token: process.env.LIGHTCODE_BROWSER_MCP_TOKEN }
      : {}),
  };
  delete process.env.LIGHTCODE_BROWSER_MCP_URL;
  delete process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (savedBrowserMcpEnv.url !== undefined) {
    process.env.LIGHTCODE_BROWSER_MCP_URL = savedBrowserMcpEnv.url;
  }
  if (savedBrowserMcpEnv.token !== undefined) {
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = savedBrowserMcpEnv.token;
  }
});

describe("getGeminiPluginPaths", () => {
  it("places Gemini settings under Poracode's plugin dir", () => {
    const baseDir = makeBaseDir();
    const paths = getGeminiPluginPaths({ envKind: "posix", baseDir });

    expect(paths.pluginDir).toBe(join(baseDir, "agent-plugins", "gemini"));
    expect(paths.settingsPath).toBe(join(baseDir, "agent-plugins", "gemini", "settings.json"));
  });
});

describe("renderGeminiSettings", () => {
  it("renders only the trimmed hook surface with the resolved-node command prefix", () => {
    const commandPrefix =
      "'/home/demo/.nvm/versions/node/v22.11.0/bin/node' '/home/demo/.poracode/agent-plugins/gemini/forward.mjs'";
    const doc = renderGeminiSettings({ headExpression: commandPrefix });

    expect(doc.hooksConfig).toEqual({ notifications: false });
    expect(Object.keys(doc.hooks)).toEqual([
      "SessionStart",
      "BeforeAgent",
      "AfterAgent",
      "Notification",
    ]);
    expect(doc.hooks.SessionStart?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.BeforeAgent?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.AfterAgent?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.Notification?.[0]?.matcher).toBeUndefined();
    expect(doc.hooks.AfterAgent?.[0]?.hooks[0]).toMatchObject({
      name: "lightcode-status-AfterAgent",
      type: "command",
      command: `${commandPrefix} AfterAgent`,
      timeout: 5000,
    });
  });

  it("does not register dropped redundant turn-open hooks", () => {
    const doc = renderGeminiSettings({ headExpression: "'/usr/bin/node' '/tmp/forward.mjs'" });
    expect(doc.hooks.BeforeModel).toBeUndefined();
    expect(doc.hooks.BeforeTool).toBeUndefined();
    expect(doc.hooks.AfterTool).toBeUndefined();
  });
});

describe("installGeminiPlugin", () => {
  it("stages assets and writes a private Gemini system settings file", () => {
    const baseDir = makeBaseDir();

    const result = installGeminiPlugin({ envKind: "posix", baseDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(existsSync(join(result.paths.pluginDir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.paths.pluginDir, "forward.mjs"))).toBe(true);
    expect(existsSync(result.paths.settingsPath)).toBe(true);
    expect(isGeminiPluginInstalled({ envKind: "posix", baseDir })).toMatchObject({
      installed: true,
      version: "1.2.3",
    });

    const settings = JSON.parse(readFileSync(result.paths.settingsPath, "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    const command = settings.hooks.Notification?.[0]?.hooks[0]?.command ?? "";
    expect(command).toMatch(/agent-plugins[\\/]+gemini[\\/]+lightcode-hook\.(?:sh|cmd|ps1)/);
    expect(command).toMatch(
      process.platform === "win32"
        ? /^(?:pwsh(?:\.exe)?|powershell(?:\.exe)?|cmd\.exe \/d \/s \/c call ")/
        : /^(?!cmd\.exe)/,
    );
  });
});

const subagentCfg: SubagentMcpHttpConfig = {
  url: "http://127.0.0.1:9200/mcp",
  token: "subagent-token",
  headers: { Authorization: "Bearer subagent-token" },
};

const browserCfg: BrowserMcpHttpConfig = {
  url: "http://127.0.0.1:45678/mcp",
  token: "browser-secret",
  headers: { Authorization: "Bearer browser-secret" },
};

const chromeCfg: ChromeMcpHttpConfig = {
  url: "http://127.0.0.1:45679/mcp",
  token: "chrome-secret",
  headers: { Authorization: "Bearer chrome-secret" },
};

type McpSettings = {
  mcpServers?: Record<string, { httpUrl?: string; headers?: Record<string, string> }>;
};

function readSettings(path: string): McpSettings {
  return JSON.parse(readFileSync(path, "utf8")) as McpSettings;
}

describe("syncGeminiSubagentMcpSettings", () => {
  it("registers and clears the subagents MCP entry without touching other keys", () => {
    const baseDir = makeBaseDir();
    const ctx = { envKind: "posix" as const, baseDir };
    const install = installGeminiPlugin(ctx);
    expect(install.ok).toBe(true);
    if (!install.ok) return;
    const settingsPath = install.paths.settingsPath;

    syncGeminiSubagentMcpSettings(ctx, subagentCfg);
    expect(readSettings(settingsPath).mcpServers).toEqual({
      subagents: {
        httpUrl: subagentCfg.url,
        headers: subagentCfg.headers,
        timeout: 300_000,
      },
    });

    // Clearing removes the subagents key and drops mcpServers entirely.
    syncGeminiSubagentMcpSettings(ctx, undefined);
    expect(readSettings(settingsPath).mcpServers).toBeUndefined();
  });

  it("coexists with the browser and Chrome MCP entries", () => {
    const baseDir = makeBaseDir();
    const ctx = { envKind: "posix" as const, baseDir };
    const install = installGeminiPlugin(ctx);
    expect(install.ok).toBe(true);
    if (!install.ok) return;
    const settingsPath = install.paths.settingsPath;

    syncGeminiSubagentMcpSettings(ctx, subagentCfg);
    syncGeminiBrowserMcpSettings({ ...ctx, browserMcpEnabled: true }, browserCfg);
    syncGeminiBrowserMcpSettings(
      { ...ctx, chromeMcpEnabled: true },
      undefined,
      undefined,
      chromeCfg,
    );

    expect(readSettings(settingsPath).mcpServers).toEqual({
      subagents: {
        httpUrl: subagentCfg.url,
        headers: subagentCfg.headers,
        timeout: 300_000,
      },
      browser: {
        httpUrl: browserCfg.url,
        headers: browserCfg.headers,
        timeout: 30_000,
      },
      chrome: {
        httpUrl: chromeCfg.url,
        headers: chromeCfg.headers,
        timeout: 30_000,
      },
    });

    // Disabling one MCP leaves the other entries intact.
    syncGeminiBrowserMcpSettings({ ...ctx, browserMcpEnabled: false }, undefined);
    expect(readSettings(settingsPath).mcpServers).toEqual({
      subagents: {
        httpUrl: subagentCfg.url,
        headers: subagentCfg.headers,
        timeout: 300_000,
      },
      chrome: {
        httpUrl: chromeCfg.url,
        headers: chromeCfg.headers,
        timeout: 30_000,
      },
    });

    syncGeminiBrowserMcpSettings({ ...ctx, chromeMcpEnabled: false });
    expect(readSettings(settingsPath).mcpServers).toEqual({
      subagents: {
        httpUrl: subagentCfg.url,
        headers: subagentCfg.headers,
        timeout: 300_000,
      },
    });
  });
});
