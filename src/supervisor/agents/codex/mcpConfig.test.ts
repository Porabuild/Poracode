import { describe, expect, it } from "vitest";
import { buildCodexMcp } from "./mcpConfig";
import { createCodexAdapter } from "./index";

describe("Codex MCP connection budget", () => {
  it("opts into deferred shared authorization", () => {
    expect(createCodexAdapter().supportsDeferredMcpAuthorization).toBe(true);
  });
  it.each(["http", "sse", "stdio"] as const)(
    "honors the configured timeout for %s in CLI and thread config",
    (type) => {
      const result = buildCodexMcp([
        {
          id: "fixture",
          name: "fixture",
          timeoutMs: 60_500,
          transport:
            type === "stdio"
              ? { type, command: "node", args: [], env: {} }
              : { type, url: "https://fixture.test/mcp", headers: {} },
        },
      ]);
      expect(result.config).toMatchObject({
        "mcp_servers.fixture": { startup_timeout_sec: 61, tool_timeout_sec: 61 },
      });
      expect(result.args).toContain("mcp_servers.fixture.startup_timeout_sec=61");
      // Leave native optional-startup grace intact so connection time does not
      // become a mandatory wait before every first turn.
      expect(result.config).not.toHaveProperty("mcp_optional_startup_grace_ms");
    },
  );
});
