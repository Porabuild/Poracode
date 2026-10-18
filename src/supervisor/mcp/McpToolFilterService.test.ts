import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { prepareMcpToolFilters } from "./McpToolFilterService";
import {
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  readMcpToolFilterConfig,
} from "./mcpToolFilterConfig";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
const server: McpServer = {
  id: "fixture",
  name: "fixture",
  description: "",
  enabled: true,
  timeoutMs: 1000,
  transport: {
    type: "stdio",
    command: "node",
    args: ["relative.mjs"],
    cwd: "/plugin",
    env: { FIXTURE: "private" },
  },
};

describe("MCP launch transport compatibility", () => {
  it("reads configurations written by the previous unversioned helper", () => {
    const config = { server, disabledTools: ["restricted"] };
    const encoded = Buffer.from(JSON.stringify(config)).toString("base64url");
    expect(readMcpToolFilterConfig({ [MCP_FILTER_CONFIG_ENV]: encoded })).toEqual(config);
    expect(() =>
      readMcpToolFilterConfig({
        [MCP_FILTER_CONFIG_ENV]: encoded,
        [MCP_FILTER_CONFIG_V1_ENV]: Buffer.from(JSON.stringify({ version: 2, ...config })).toString(
          "base64url",
        ),
      }),
    ).toThrow("Unsupported MCP filter configuration version");
  });

  it("wraps external MCPs in a failure-isolating helper without changing upstream configuration", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-filter.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const [wrapped] = await prepareMcpToolFilters(
      [server],
      { kind: "posix", path: "/project" },
      { isolateConnectionFailures: true },
    );
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    expect(wrapped!.transport.env[MCP_FILTER_CONFIG_ENV]).toBeUndefined();
    expect(readMcpToolFilterConfig(wrapped!.transport.env)).toEqual({
      version: 1,
      isolateConnectionFailures: true,
      server,
      disabledTools: [],
    });
    expect(wrapped!.transport.args.join(" ")).not.toContain("private");
  });

  it("preserves native transports unless filtering or cwd emulation is needed", async () => {
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", "/missing");
    expect(await prepareMcpToolFilters([server], { kind: "posix", path: "/project" })).toEqual([
      server,
    ]);
    await expect(
      prepareMcpToolFilters([server], { kind: "posix", path: "/project" }, { proxyStdioCwd: true }),
    ).rejects.toThrow("unavailable");
  });
  it("preserves the original cwd, environment, and timeout inside the proxy config", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-stdio.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const [wrapped] = await prepareMcpToolFilters(
      [server],
      { kind: "posix", path: "/project" },
      { proxyStdioCwd: true },
    );
    expect(wrapped!.transport.type).toBe("stdio");
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-stdio.mjs")]);
    const config = JSON.parse(
      Buffer.from(wrapped!.transport.env.PORACODE_MCP_STDIO_CONFIG!, "base64url").toString("utf8"),
    );
    expect(config).toEqual({ version: 1, server });
    expect(wrapped!.transport.args.join(" ")).not.toContain("private");
  });
});
