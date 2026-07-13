import { afterEach, describe, expect, it } from "vitest";
import { buildAcpChromeMcpServers } from "../acp/mcpChrome";
import { buildClaudeChromeMcpServers } from "../claude/mcpChrome";
import { buildCodexChromeMcpArgs, buildCodexChromeMcpEnv } from "../codex/mcpChrome";
import { buildGeminiChromeMcpServers } from "../gemini/mcpChrome";
import { buildOpenCodeChromeMcp } from "../opencode/mcpChrome";
import { resolveChromeMcpHttpConfigForLaunch, type ChromeMcpHttpConfig } from "./index";

const windowsLocation = { kind: "windows" } as const;
const wslLocation = { kind: "wsl", distro: "Ubuntu" } as const;
const chromeMcp: ChromeMcpHttpConfig = {
  url: "http://127.0.0.1:45678/mcp",
  token: "chrome-secret",
  headers: { Authorization: "Bearer chrome-secret" },
};

afterEach(() => {
  delete process.env.PORACODE_CHROME_MCP_URL;
  delete process.env.PORACODE_CHROME_MCP_TOKEN;
});

describe("Chrome MCP provider configs", () => {
  it("resolves the local HTTP endpoint from supervisor env", () => {
    process.env.PORACODE_CHROME_MCP_URL = "http://127.0.0.1:65094";
    process.env.PORACODE_CHROME_MCP_TOKEN = "host-token";

    expect(resolveChromeMcpHttpConfigForLaunch(windowsLocation, true)).toEqual({
      url: "http://127.0.0.1:65094/mcp",
      token: "host-token",
      headers: { Authorization: "Bearer host-token" },
    });
  });

  it("tags the endpoint with the owning thread identity", () => {
    process.env.PORACODE_CHROME_MCP_URL = "http://127.0.0.1:65094";
    process.env.PORACODE_CHROME_MCP_TOKEN = "host-token";

    expect(
      resolveChromeMcpHttpConfigForLaunch(windowsLocation, true, {
        threadId: "thread-1",
        title: "Chrome task",
      })?.url,
    ).toBe("http://127.0.0.1:65094/mcp?thread=thread-1&title=Chrome%20task");
  });

  it("declines for WSL projects (no in-distro bridge)", () => {
    process.env.PORACODE_CHROME_MCP_URL = "http://127.0.0.1:65094";
    process.env.PORACODE_CHROME_MCP_TOKEN = "host-token";

    expect(resolveChromeMcpHttpConfigForLaunch(wslLocation, true)).toBeUndefined();
    // The pre-resolved config is never handed to WSL, so every builder declines.
    expect(buildAcpChromeMcpServers(wslLocation, true)).toEqual([]);
    expect(buildClaudeChromeMcpServers(wslLocation, true)).toBeUndefined();
    expect(buildCodexChromeMcpArgs(wslLocation, true)).toEqual([]);
    expect(buildGeminiChromeMcpServers(wslLocation, true)).toBeUndefined();
    expect(buildOpenCodeChromeMcp(wslLocation, true)).toBeUndefined();
  });

  it("uses the same MCP server shape for each provider adapter", () => {
    expect(buildAcpChromeMcpServers(windowsLocation, true, chromeMcp)).toEqual([
      {
        type: "http",
        name: "chrome",
        url: chromeMcp.url,
        headers: [{ name: "Authorization", value: "Bearer chrome-secret" }],
      },
    ]);
    expect(buildClaudeChromeMcpServers(windowsLocation, true, chromeMcp)).toEqual({
      chrome: {
        type: "http",
        url: chromeMcp.url,
        headers: chromeMcp.headers,
      },
    });
    expect(buildCodexChromeMcpArgs(windowsLocation, true, chromeMcp)).toContain(
      'mcp_servers.chrome.url="http://127.0.0.1:45678/mcp"',
    );
    expect(buildCodexChromeMcpEnv(chromeMcp)).toEqual({
      PORACODE_CHROME_MCP_TOKEN: "chrome-secret",
    });
    expect(buildGeminiChromeMcpServers(windowsLocation, true, chromeMcp)).toEqual({
      chrome: {
        httpUrl: chromeMcp.url,
        headers: chromeMcp.headers,
        timeout: 30_000,
      },
    });
    expect(buildOpenCodeChromeMcp(windowsLocation, true, chromeMcp)).toEqual({
      chrome: {
        type: "remote",
        url: chromeMcp.url,
        headers: chromeMcp.headers,
        enabled: true,
      },
    });
  });

  it("early-returns for every provider when the thread did not opt in", () => {
    // The gate must live inside each builder so a call site can never forget it
    // and leak the external-Chrome endpoint into a non-opted-in thread. Env is
    // set to prove the builders honor `enabled` rather than the env fallback.
    process.env.PORACODE_CHROME_MCP_URL = "http://127.0.0.1:65094";
    process.env.PORACODE_CHROME_MCP_TOKEN = "host-token";

    expect(buildAcpChromeMcpServers(windowsLocation, false, chromeMcp)).toEqual([]);
    expect(buildClaudeChromeMcpServers(windowsLocation, false, chromeMcp)).toBeUndefined();
    expect(buildCodexChromeMcpArgs(windowsLocation, false, chromeMcp)).toEqual([]);
    expect(buildGeminiChromeMcpServers(windowsLocation, false, chromeMcp)).toBeUndefined();
    expect(buildOpenCodeChromeMcp(windowsLocation, false, chromeMcp)).toBeUndefined();
  });

  it("uses a token env var distinct from the browser and computer-use ones", () => {
    expect(buildCodexChromeMcpEnv(chromeMcp)).toHaveProperty("PORACODE_CHROME_MCP_TOKEN");
    expect(buildCodexChromeMcpEnv(chromeMcp)).not.toHaveProperty("PORACODE_BROWSER_MCP_TOKEN");
    expect(buildCodexChromeMcpEnv(chromeMcp)).not.toHaveProperty("PORACODE_COMPUTER_USE_MCP_TOKEN");
    expect(buildCodexChromeMcpEnv(undefined)).toBeUndefined();
  });
});
