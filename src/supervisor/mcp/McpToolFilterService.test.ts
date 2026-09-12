import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { prepareMcpToolFilters } from "./McpToolFilterService";

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
