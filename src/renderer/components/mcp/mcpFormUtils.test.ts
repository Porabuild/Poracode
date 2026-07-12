import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import {
  mcpFormStateToServer,
  mcpServerToFormState,
  newMcpServerFormState,
  parseMcpArguments,
  parseMcpServersJson,
  serializeMcpServersJson,
  validateMcpServerForm,
} from "./mcpFormUtils";

const stdioServer: McpServer = {
  id: "memory-id",
  name: "memory",
  description: "Memory tools",
  enabled: true,
  timeoutMs: 45_000,
  transport: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory", "path with spaces"],
    env: { API_KEY: "value" },
    cwd: "C:\\repo",
  },
};

describe("MCP form helpers", () => {
  it("parses quoted arguments without invoking a shell", () => {
    expect(parseMcpArguments(`-y "path with spaces" 'single quoted' plain`)).toEqual([
      "-y",
      "path with spaces",
      "single quoted",
      "plain",
    ]);
  });

  it("round-trips empty, quoted, escaped, and Windows path arguments", () => {
    const server: McpServer = {
      ...stdioServer,
      transport: {
        type: "stdio",
        command: "npx",
        env: { API_KEY: "value" },
        cwd: "C:\\repo",
        args: ["", 'say "hello"', "C:\\tools\\server"],
      },
    };
    const state = mcpServerToFormState(server);
    expect(mcpFormStateToServer(state, server)).toEqual(server);
    expect(parseMcpArguments('"C:\\Program Files\\server"')).toEqual(["C:\\Program Files\\server"]);
  });

  it("preserves stdio metadata through the form", () => {
    const state = mcpServerToFormState(stdioServer);
    expect(mcpFormStateToServer(state, stdioServer)).toEqual(stdioServer);
  });

  it("rejects duplicate and built-in names", () => {
    const duplicate = { ...newMcpServerFormState("id"), name: "Memory", command: "node" };
    expect(validateMcpServerForm(duplicate, new Set(["memory"])).errors.name).toBe(
      "name-duplicate",
    );

    const reserved = { ...duplicate, name: "browser" };
    expect(validateMcpServerForm(reserved, new Set()).errors.name).toBe("name-reserved");

    const malformedRecords = {
      ...newMcpServerFormState("id"),
      name: "memory",
      command: "node",
      envText: "API_KEY value",
    };
    expect(validateMcpServerForm(malformedRecords, new Set()).errors.envText).toBe("env-invalid");

    const invalidUrl = {
      ...newMcpServerFormState("id"),
      name: "remote",
      transportType: "http" as const,
      url: "ftp://example.com/mcp",
    };
    expect(validateMcpServerForm(invalidUrl, new Set()).errors.url).toBe("url-invalid");
  });
});

describe("MCP JSON helpers", () => {
  it("accepts both top-level and mcpServers-wrapped configurations", () => {
    const topLevel = parseMcpServersJson(
      JSON.stringify({ memory: { command: "npx", args: ["-y", "server-memory"] } }),
      () => "top-level-id",
    );
    expect(topLevel).toEqual({
      ok: true,
      servers: [
        {
          id: "top-level-id",
          name: "memory",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "stdio",
            command: "npx",
            args: ["-y", "server-memory"],
            env: {},
          },
        },
      ],
    });

    const wrapped = parseMcpServersJson(
      JSON.stringify({
        mcpServers: {
          remote: {
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      }),
      () => "wrapped-id",
    );
    expect(wrapped.ok && wrapped.servers[0]?.transport).toEqual({
      type: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("round-trips exported server configuration", () => {
    const parsed = parseMcpServersJson(serializeMcpServersJson([stdioServer]), () => "new-id");
    expect(parsed.ok && parsed.servers[0]).toEqual({ ...stdioServer, id: "new-id" });

    const namedLikeWrapper = { ...stdioServer, id: "wrapper-id", name: "mcpServers" };
    const wrapperParsed = parseMcpServersJson(
      serializeMcpServersJson([namedLikeWrapper]),
      () => "new-wrapper-id",
    );
    expect(wrapperParsed.ok && wrapperParsed.servers[0]).toEqual({
      ...namedLikeWrapper,
      id: "new-wrapper-id",
    });
  });

  it("rejects reserved names and invalid entries", () => {
    expect(
      parseMcpServersJson(JSON.stringify({ browser: { command: "node" } }), () => "id"),
    ).toEqual({ ok: false, error: "invalid-server" });
    expect(parseMcpServersJson("{not-json", () => "id")).toEqual({
      ok: false,
      error: "invalid-json",
    });
    expect(
      parseMcpServersJson(JSON.stringify({ broken: { command: "node", args: "--flag" } })),
    ).toEqual({ ok: false, error: "invalid-server" });
    expect(
      parseMcpServersJson(
        JSON.stringify({ broken: { type: "http", url: "https://example.com", headers: [] } }),
      ),
    ).toEqual({ ok: false, error: "invalid-server" });
    expect(parseMcpServersJson(JSON.stringify({ broken: { type: "http", url: "   " } }))).toEqual({
      ok: false,
      error: "invalid-server",
    });
  });
});
