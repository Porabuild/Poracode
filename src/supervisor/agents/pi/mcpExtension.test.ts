import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writePiMcpExtension } from "./mcpExtension";

describe("writePiMcpExtension", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const path of created) rmSync(dirname(path), { recursive: true, force: true });
    created.length = 0;
  });

  it("generates a self-contained ESM extension embedding the server config", async () => {
    const extensionPath = await writePiMcpExtension([
      {
        id: "srv",
        name: "my-server",
        timeoutMs: 12_345,
        disabledTools: ["secret"],
        transport: { type: "stdio", command: "node", args: ["server.mjs"], env: { KEY: "val" } },
      },
    ]);
    created.push(extensionPath);
    expect(existsSync(extensionPath)).toBe(true);
    const source = readFileSync(extensionPath, "utf8");
    // Server config is embedded for the bridge to consume.
    expect(source).toContain('"my-server"');
    expect(source).toContain("12345");
    expect(source).toContain('"secret"');
    expect(source).toContain("server.mjs");
    // Self-contained: pi ships no MCP SDK, so the bridge must not import one.
    expect(source).not.toContain("@modelcontextprotocol");
    // The generated module parses and loads without running the bridge.
    const mod = await import(pathToFileURL(extensionPath).href);
    expect(typeof mod.default).toBe("function");
  });
});
