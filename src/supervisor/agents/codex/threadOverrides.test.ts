import { describe, expect, it } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { codexMcpTokenEnvVar } from "../userMcp";
import { buildCodexThreadOverrides } from "./threadOverrides";

describe("buildCodexThreadOverrides", () => {
  it("scopes cwd and MCP configuration to the app-server thread", () => {
    const browser: ResolvedMcpServer = {
      id: "browser",
      name: "browser",
      timeoutMs: 30_000,
      transport: {
        type: "http",
        url: "http://127.0.0.1:9000/mcp?thread=local-thread",
        headers: { Authorization: "Bearer secret-token" },
      },
    };

    const overrides = buildCodexThreadOverrides(
      { model: "gpt-5.6", effort: "high" },
      {
        projectLocation: { kind: "windows", path: "C:\\repo" },
        mcpServers: [browser],
      },
    );

    expect(overrides.cwd).toBe("C:\\repo");
    expect(overrides.config).toMatchObject({
      model_reasoning_effort: "high",
      "mcp_servers.browser": {
        url: "http://127.0.0.1:9000/mcp?thread=local-thread",
        bearer_token_env_var: codexMcpTokenEnvVar(browser),
        tool_timeout_sec: 30,
      },
    });
    expect(JSON.stringify(overrides.config)).not.toContain("secret-token");
  });
});
