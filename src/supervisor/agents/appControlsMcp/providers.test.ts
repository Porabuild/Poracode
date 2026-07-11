import { describe, expect, it } from "vitest";
import { buildAcpAppControlsMcpServers } from "../acp/mcpAppControls";
import { buildClaudeAppControlsMcpServers } from "../claude/mcpAppControls";
import { buildCodexAppControlsMcpArgs, buildCodexAppControlsMcpEnv } from "../codex/mcpAppControls";
import { buildGeminiAppControlsMcpServers } from "../gemini/mcpAppControls";
import { buildOpenCodeAppControlsMcp } from "../opencode/mcpAppControls";
import type { AppControlsMcpHttpConfig } from ".";

const location = { kind: "windows" } as const;
const config: AppControlsMcpHttpConfig = {
  url: "http://127.0.0.1:4020/mcp?thread=one",
  token: "secret",
  headers: { Authorization: "Bearer secret" },
};

describe("app controls MCP provider mappings", () => {
  it("maps the same Poracode server into every provider shape", () => {
    expect(buildAcpAppControlsMcpServers(location, config)[0]).toMatchObject({
      name: "poracode",
      url: config.url,
    });
    expect(buildClaudeAppControlsMcpServers(location, config)?.poracode).toMatchObject({
      url: config.url,
    });
    expect(buildCodexAppControlsMcpArgs(location, config).join(" ")).toContain(
      "mcp_servers.poracode.url",
    );
    expect(buildCodexAppControlsMcpEnv(config)).toEqual({
      LIGHTCODE_APP_CONTROLS_MCP_TOKEN: "secret",
    });
    expect(buildGeminiAppControlsMcpServers(location, config)?.poracode).toMatchObject({
      httpUrl: config.url,
    });
    expect(buildOpenCodeAppControlsMcp(location, config)?.poracode).toMatchObject({
      url: config.url,
      enabled: true,
    });
  });
});
