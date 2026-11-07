import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { fxNativeMcpConfig } from "./nativeMcp";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fx-native-mcp-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const server: McpServer = {
  id: "proof",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 45_000,
  transport: { type: "stdio", command: "node", args: [], env: {} },
};

function httpServer(overrides: { url?: string; headers?: Record<string, string> }): McpServer {
  return {
    ...server,
    transport: {
      type: "http",
      url: overrides.url ?? "https://example.test/mcp",
      headers: overrides.headers ?? {},
    },
  };
}

describe("fx native MCP entry", () => {
  it("maps a stdio server with both timeouts", () => {
    expect(fxNativeMcpConfig().entry(server)).toEqual({
      command: "node",
      startup_timeout_ms: 45_000,
      operation_timeout_ms: 45_000,
    });
  });

  it("keeps stdio args and env when present", () => {
    expect(
      fxNativeMcpConfig().entry({
        ...server,
        transport: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "value" },
        },
      }),
    ).toEqual({
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "value" },
      startup_timeout_ms: 45_000,
      operation_timeout_ms: 45_000,
    });
  });

  it("maps an HTTP server with its headers", () => {
    expect(
      fxNativeMcpConfig().entry(
        httpServer({ headers: { "X-Request-Id": "fixture", Authorizationless: "ok" } }),
      ),
    ).toEqual({
      type: "http",
      url: "https://example.test/mcp",
      headers: { "X-Request-Id": "fixture", Authorizationless: "ok" },
      startup_timeout_ms: 45_000,
      operation_timeout_ms: 45_000,
    });
  });

  it("accepts http only on an explicit localhost-family port", () => {
    expect(
      fxNativeMcpConfig().entry(httpServer({ url: "http://localhost:4321/mcp" })),
    ).toMatchObject({ type: "http", url: "http://localhost:4321/mcp" });
    expect(
      fxNativeMcpConfig().entry(httpServer({ url: "http://127.0.0.1:8080/mcp" })),
    ).toMatchObject({ url: "http://127.0.0.1:8080/mcp" });
    expect(() => fxNativeMcpConfig().entry(httpServer({ url: "http://localhost/mcp" }))).toThrow(
      "Insecure HTTP endpoints are not supported by native setup",
    );
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ url: "http://example.com:8080/mcp" })),
    ).toThrow("Insecure HTTP endpoints are not supported by native setup");
  });

  it("refuses every option fx cannot represent", () => {
    expect(() => fxNativeMcpConfig().entry({ ...server, disabledTools: ["write"] })).toThrow(
      "Tool restrictions are not supported by native setup",
    );
    expect(() => fxNativeMcpConfig().entry({ ...server, timeoutMs: 4_294_967_296 })).toThrow(
      "Timeout is too long for native setup",
    );
    expect(() =>
      fxNativeMcpConfig().entry({
        ...server,
        transport: { type: "sse", url: "https://example.test/events", headers: {} },
      }),
    ).toThrow("SSE is not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry({
        ...server,
        transport: { type: "stdio", command: "node", args: [], env: {}, cwd: "/fixture" },
      }),
    ).toThrow("Working directory is not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ url: "https://user:pass@example.test/mcp" })),
    ).toThrow("Credentials or fragments in URLs are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ url: "https://example.test/mcp#fragment" })),
    ).toThrow("Credentials or fragments in URLs are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { Authorization: "Bearer x" } })),
    ).toThrow("Authorization headers are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { authorization: "Bearer x" } })),
    ).toThrow("Authorization headers are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { Host: "example.test" } })),
    ).toThrow("Reserved headers are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { "Mcp-Param-Tool": "x" } })),
    ).toThrow("Reserved headers are not supported by native setup");
    expect(() => fxNativeMcpConfig().entry(httpServer({ headers: { "bad header": "x" } }))).toThrow(
      "Headers fx cannot send are not supported by native setup",
    );
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { "X-Test": "line\nbreak" } })),
    ).toThrow("Headers fx cannot send are not supported by native setup");
    expect(() =>
      fxNativeMcpConfig().entry(httpServer({ headers: { "X-Test": "a", "x-test": "b" } })),
    ).toThrow("Headers fx cannot send are not supported by native setup");
  });
});

describe("fx native MCP server table", () => {
  it("writes a new file under mcpServers", () => {
    const config = fxNativeMcpConfig(join(root, "empty.json"));
    const written = config.write("", "proof", { command: "node" });
    expect(JSON.parse(written)).toEqual({ mcpServers: { proof: { command: "node" } } });
  });

  it("edits an existing mcp table and preserves other keys and servers", () => {
    const config = fxNativeMcpConfig(join(root, "mcp.json"));
    const written = config.write(
      JSON.stringify({ unrelated: true, mcp: { existing: { command: "keep" } } }),
      "proof",
      { command: "node" },
    );
    expect(JSON.parse(written)).toEqual({
      unrelated: true,
      mcp: { existing: { command: "keep" }, proof: { command: "node" } },
    });
  });

  it("reads whichever table exists", () => {
    const config = fxNativeMcpConfig(join(root, "read.json"));
    expect(config.read(JSON.stringify({ mcp: { proof: { command: "a" } } }))).toEqual({
      proof: { command: "a" },
    });
    expect(config.read(JSON.stringify({ mcpServers: { proof: { command: "b" } } }))).toEqual({
      proof: { command: "b" },
    });
  });

  it("refuses a file that defines both tables", () => {
    const config = fxNativeMcpConfig(join(root, "ambiguous.json"));
    const ambiguous = JSON.stringify({ mcp: {}, mcpServers: {} });
    expect(() => config.read(ambiguous)).toThrow("Ambiguous native MCP server tables");
    expect(() => config.write(ambiguous, "proof", { command: "node" })).toThrow(
      "Ambiguous native MCP server tables",
    );
  });
});
