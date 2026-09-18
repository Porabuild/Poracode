import { describe, expect, it, vi } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("../wsl/wslDeploy", () => ({
  resolveWslHelpersDir: () => "/helpers",
  deployFilesToWslTempBase: vi.fn<() => undefined>(),
}));
import { prepareMcpToolFilters } from "./McpToolFilterService";

const server: ResolvedMcpServer = {
  id: "remote",
  name: "Remote",
  timeoutMs: 15000,
  transport: {
    type: "http",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer example" },
  },
};

describe("MCP stdio relay preparation", () => {
  it("preserves remote servers when no filtering or relay is requested", async () => {
    const result = await prepareMcpToolFilters([server], { kind: "posix", path: "/project" });
    expect(result[0]).toBe(server);
  });
  it("relays remote servers without disabling tools and retains credentials in env", async () => {
    const [result] = await prepareMcpToolFilters(
      [server],
      { kind: "posix", path: "/project" },
      { remoteViaStdio: true },
    );
    expect(result?.transport.type).toBe("stdio");
    if (result?.transport.type !== "stdio") throw new Error("Expected stdio");
    expect(result.transport.args).toEqual(["/helpers/mcp-filter.mjs"]);
    const config = JSON.parse(
      Buffer.from(result.transport.env.PORACODE_MCP_FILTER_CONFIG!, "base64url").toString("utf8"),
    );
    expect(config).toEqual({ server, disabledTools: [] });
    expect(result.transport.args.join(" ")).not.toContain("Bearer");
  });
  it("does not double-wrap existing unfiltered stdio servers", async () => {
    const local: ResolvedMcpServer = {
      ...server,
      transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
    };
    expect(
      (
        await prepareMcpToolFilters(
          [local],
          { kind: "posix", path: "/project" },
          { remoteViaStdio: true },
        )
      )[0],
    ).toBe(local);
  });
});
