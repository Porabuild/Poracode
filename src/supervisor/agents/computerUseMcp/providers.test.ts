import { afterEach, describe, expect, it } from "vitest";
import { buildAcpComputerUseMcpServers } from "../acp/mcpComputerUse";
import { buildClaudeComputerUseMcpServers } from "../claude/mcpComputerUse";
import { buildCodexComputerUseMcpArgs, buildCodexComputerUseMcpEnv } from "../codex/mcpComputerUse";
import { buildGeminiComputerUseMcpServers } from "../gemini/mcpComputerUse";
import { buildOpenCodeComputerUseMcp } from "../opencode/mcpComputerUse";
import { resolveComputerUseMcpHttpConfigForLaunch, type ComputerUseMcpHttpConfig } from "./index";

const windowsLocation = { kind: "windows" } as const;
const computerUseMcp: ComputerUseMcpHttpConfig = {
  url: "http://127.0.0.1:45678/mcp",
  token: "computer-use-secret",
  headers: { Authorization: "Bearer computer-use-secret" },
};

afterEach(() => {
  delete process.env.LIGHTCODE_COMPUTER_USE_MCP_URL;
  delete process.env.LIGHTCODE_COMPUTER_USE_MCP_TOKEN;
});

describe("Computer Use MCP provider configs", () => {
  it("resolves the local HTTP endpoint from supervisor env", () => {
    process.env.LIGHTCODE_COMPUTER_USE_MCP_URL = "http://127.0.0.1:65094";
    process.env.LIGHTCODE_COMPUTER_USE_MCP_TOKEN = "host-token";

    expect(resolveComputerUseMcpHttpConfigForLaunch(windowsLocation, true)).toEqual({
      url: "http://127.0.0.1:65094/mcp",
      token: "host-token",
      headers: { Authorization: "Bearer host-token" },
    });
  });

  it("uses the same MCP server shape for each provider adapter", () => {
    expect(buildAcpComputerUseMcpServers(windowsLocation, true, computerUseMcp)).toEqual([
      {
        type: "http",
        name: "computer_use",
        url: computerUseMcp.url,
        headers: [{ name: "Authorization", value: "Bearer computer-use-secret" }],
      },
    ]);
    expect(buildClaudeComputerUseMcpServers(windowsLocation, true, computerUseMcp)).toEqual({
      computer_use: {
        type: "http",
        url: computerUseMcp.url,
        headers: computerUseMcp.headers,
      },
    });
    expect(buildCodexComputerUseMcpArgs(windowsLocation, true, computerUseMcp)).toContain(
      'mcp_servers.computer_use.url="http://127.0.0.1:45678/mcp"',
    );
    expect(buildCodexComputerUseMcpEnv(computerUseMcp)).toEqual({
      LIGHTCODE_COMPUTER_USE_MCP_TOKEN: "computer-use-secret",
    });
    expect(buildGeminiComputerUseMcpServers(windowsLocation, true, computerUseMcp)).toEqual({
      computer_use: {
        httpUrl: computerUseMcp.url,
        headers: computerUseMcp.headers,
        timeout: 30_000,
      },
    });
    expect(buildOpenCodeComputerUseMcp(windowsLocation, true, computerUseMcp)).toEqual({
      computer_use: {
        type: "remote",
        url: computerUseMcp.url,
        headers: computerUseMcp.headers,
        enabled: true,
      },
    });
  });

  it("early-returns for every provider when the thread did not opt in", () => {
    // The gate must live inside each builder so a call site can never forget it
    // and leak the desktop-control endpoint into a non-opted-in thread. Env is
    // set to prove the builders honor `enabled` rather than the env fallback.
    process.env.LIGHTCODE_COMPUTER_USE_MCP_URL = "http://127.0.0.1:65094";
    process.env.LIGHTCODE_COMPUTER_USE_MCP_TOKEN = "host-token";

    expect(buildAcpComputerUseMcpServers(windowsLocation, false, computerUseMcp)).toEqual([]);
    expect(
      buildClaudeComputerUseMcpServers(windowsLocation, false, computerUseMcp),
    ).toBeUndefined();
    expect(buildCodexComputerUseMcpArgs(windowsLocation, false, computerUseMcp)).toEqual([]);
    expect(
      buildGeminiComputerUseMcpServers(windowsLocation, false, computerUseMcp),
    ).toBeUndefined();
    expect(buildOpenCodeComputerUseMcp(windowsLocation, false, computerUseMcp)).toBeUndefined();
  });
});
