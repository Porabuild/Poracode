import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAcpBrowserMcpServers } from "../acp/mcpBrowser";
import { buildClaudeBrowserMcpServers } from "../claude/mcpBrowser";
import { buildCodexBrowserMcpArgs, buildCodexBrowserMcpEnv } from "../codex/mcpBrowser";
import { buildGeminiBrowserMcpServers } from "../gemini/mcpBrowser";
import { buildOpenCodeBrowserMcp } from "../opencode/mcpBrowser";
import { resolveBrowserMcpHttpConfigForLaunch, type BrowserMcpHttpConfig } from "./index";

const wslLocation = { kind: "wsl", distro: "Ubuntu" } as const;
const sshLocation = { kind: "ssh", host: "devbox", path: "/repo" } as const;
const bridgeMcp: BrowserMcpHttpConfig = {
  url: "http://127.0.0.1:45678/mcp",
  token: "bridge-secret",
  headers: { Authorization: "Bearer bridge-secret" },
};

afterEach(() => {
  delete process.env.LIGHTCODE_BROWSER_MCP_URL;
  delete process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
});

describe("WSL Browser MCP provider configs", () => {
  it("resolves WSL Browser MCP through the in-distro bridge", async () => {
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:65093";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "host-token";
    const ensureBridge = vi.fn<() => Promise<{ baseUrl: string; secret: string }>>(async () => ({
      baseUrl: "http://127.0.0.1:45678",
      secret: "bridge-secret",
    }));

    await expect(
      resolveBrowserMcpHttpConfigForLaunch(wslLocation, true, { ensureBridge }),
    ).resolves.toEqual(bridgeMcp);
    expect(ensureBridge).toHaveBeenCalledWith("Ubuntu");
  });

  it("uses the same bridge MCP endpoint shape for every WSL provider", () => {
    expect(buildAcpBrowserMcpServers(wslLocation, true, bridgeMcp)).toEqual([
      {
        type: "http",
        name: "browser",
        url: bridgeMcp.url,
        headers: [{ name: "Authorization", value: "Bearer bridge-secret" }],
      },
    ]);
    expect(buildClaudeBrowserMcpServers(wslLocation, true, bridgeMcp)).toEqual({
      browser: {
        type: "http",
        url: bridgeMcp.url,
        headers: bridgeMcp.headers,
      },
    });
    expect(buildCodexBrowserMcpArgs(wslLocation, true, bridgeMcp)).toContain(
      'mcp_servers.browser.url="http://127.0.0.1:45678/mcp"',
    );
    expect(buildCodexBrowserMcpEnv(bridgeMcp)).toEqual({
      LIGHTCODE_BROWSER_MCP_TOKEN: "bridge-secret",
    });
    expect(buildGeminiBrowserMcpServers(wslLocation, bridgeMcp)).toEqual({
      browser: {
        httpUrl: bridgeMcp.url,
        headers: bridgeMcp.headers,
        timeout: 30_000,
      },
    });
    expect(buildOpenCodeBrowserMcp(wslLocation, bridgeMcp)).toEqual({
      browser: {
        type: "remote",
        url: bridgeMcp.url,
        headers: bridgeMcp.headers,
        enabled: true,
      },
    });
  });

  it("does not fall back to host-gateway MCP when WSL bridge resolution failed", () => {
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:65093";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "host-token";

    expect(buildAcpBrowserMcpServers(wslLocation, true)).toEqual([]);
    expect(buildClaudeBrowserMcpServers(wslLocation, true)).toBeUndefined();
    expect(buildCodexBrowserMcpArgs(wslLocation, true)).toEqual([]);
    expect(buildGeminiBrowserMcpServers(wslLocation)).toBeUndefined();
    expect(buildOpenCodeBrowserMcp(wslLocation)).toBeUndefined();
  });

  it("resolves SSH Browser MCP through a reverse SSH bridge", async () => {
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:65093";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "host-token";
    const ensureSshBridge = vi.fn<
      (
        location: typeof sshLocation,
        upstream: { url: string; token: string },
      ) => Promise<{ baseUrl: string; secret: string }>
    >(async () => ({
      baseUrl: "http://127.0.0.1:45678",
      secret: "host-token",
    }));
    const ensureBridge = vi.fn<() => Promise<{ baseUrl: string; secret: string } | undefined>>();

    await expect(
      resolveBrowserMcpHttpConfigForLaunch(sshLocation, true, {
        ensureBridge,
        ensureSshBridge,
      }),
    ).resolves.toEqual({
      url: "http://127.0.0.1:45678/mcp",
      token: "host-token",
      headers: { Authorization: "Bearer host-token" },
    });
    expect(ensureSshBridge).toHaveBeenCalledWith(sshLocation, {
      url: "http://127.0.0.1:65093",
      token: "host-token",
    });
  });

  it("does not fall back to local loopback MCP for SSH when no SSH bridge exists", () => {
    process.env.LIGHTCODE_BROWSER_MCP_URL = "http://127.0.0.1:65093";
    process.env.LIGHTCODE_BROWSER_MCP_TOKEN = "host-token";

    expect(buildAcpBrowserMcpServers(sshLocation, true)).toEqual([]);
    expect(buildClaudeBrowserMcpServers(sshLocation, true)).toBeUndefined();
    expect(buildCodexBrowserMcpArgs(sshLocation, true)).toEqual([]);
    expect(buildGeminiBrowserMcpServers(sshLocation)).toBeUndefined();
    expect(buildOpenCodeBrowserMcp(sshLocation)).toBeUndefined();
  });
});
