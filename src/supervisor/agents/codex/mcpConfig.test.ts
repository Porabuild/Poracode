import { describe, expect, it } from "vitest";
import { buildCodexMcp } from "./mcpConfig";
import { createCodexAdapter } from "./index";
import type { ResolvedMcpServer } from "@/shared/contracts";

const proxy: ResolvedMcpServer = {
  id: "custom-admin",
  name: "custom-admin",
  timeoutMs: 30_000,
  transport: { type: "stdio", command: "node", args: ["proxy.mjs"], env: {} },
};

describe("Codex native MCP collisions", () => {
  it("keeps an existing HTTP table valid when injecting its stdio proxy", () => {
    const result = buildCodexMcp([proxy], ["custom-admin"]);
    const native = result.config["mcp_servers.custom-admin"];
    expect(native).toEqual({ enabled: false });
    const injected = Object.entries(result.config).find(([key]) =>
      key.startsWith("mcp_servers.poracode_custom-admin_"),
    );
    expect(injected?.[1]).toMatchObject({ command: "node", args: ["proxy.mjs"] });
    expect(result.args).toContain("mcp_servers.custom-admin.enabled=false");
    expect(result.args).not.toContain('mcp_servers.custom-admin.command="node"');
  });

  it("does not disable or rename a server absent from native config", () => {
    const result = buildCodexMcp([proxy], ["unrelated"]);
    expect(Object.keys(result.config)).toEqual(["mcp_servers.custom-admin"]);
    expect(result.config["mcp_servers.custom-admin"]).toMatchObject({ command: "node" });
    expect(result.args).not.toContain("mcp_servers.unrelated.enabled=false");
  });

  it("avoids native and injected alias collisions deterministically", () => {
    const initial = buildCodexMcp([proxy], ["custom-admin"]);
    const alias = Object.keys(initial.config).find((key) => key !== "mcp_servers.custom-admin")!;
    const name = alias.slice("mcp_servers.".length);
    const servers = [proxy, { ...proxy, id: "second", name: `${name}_2` }];
    const result = buildCodexMcp(servers, ["custom-admin", name]);
    expect(result.config[`${alias}_3`]).toMatchObject({ command: "node" });
    expect(result.config[`${alias}_2`]).toMatchObject({ command: "node" });
    expect(result.config).not.toHaveProperty(alias);
    expect(buildCodexMcp(servers, [name, "custom-admin"])).toEqual(result);
  });

  it("isolates HTTP overrides from native stdio fields and preserves credential env", () => {
    const server: ResolvedMcpServer = {
      ...proxy,
      transport: {
        type: "http",
        url: "https://admin.test/mcp",
        headers: { Authorization: "Bearer fixture-secret" },
      },
    };
    const result = buildCodexMcp([server], ["custom-admin"]);
    const injected = Object.entries(result.config).find(([key]) =>
      key.startsWith("mcp_servers.poracode_"),
    );
    expect(injected?.[1]).toMatchObject({ url: "https://admin.test/mcp" });
    expect(Object.values(result.env)).toContain("fixture-secret");
    expect(JSON.stringify(result.config)).not.toContain("fixture-secret");
    expect(result.args.join(" ")).not.toContain("fixture-secret");
  });
});

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
