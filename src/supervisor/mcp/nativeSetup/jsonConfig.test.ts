import { describe, expect, it } from "vitest";
import { nativeJsonMcpConfig } from "./jsonConfig";

const entry = (server: { transport: unknown }) => server.transport;

describe("nativeJsonMcpConfig table selection", () => {
  it("defaults to the mcpServers table", () => {
    const config = nativeJsonMcpConfig("config.json", entry);
    expect(config.read(JSON.stringify({ mcp: { ignored: {} } }))).toEqual({});
    expect(JSON.parse(config.write("", "proof", { command: "node" }))).toEqual({
      mcpServers: { proof: { command: "node" } },
    });
    expect(
      JSON.parse(
        config.write(JSON.stringify({ mcpServers: { existing: {} } }), "proof", {
          command: "node",
        }),
      ),
    ).toEqual({ mcpServers: { existing: {}, proof: { command: "node" } } });
  });

  it("uses the declared table names instead of mcpServers", () => {
    const config = nativeJsonMcpConfig("config.json", entry, {
      tableKeys: ["mcpServers", "mcp"],
    });
    expect(config.read(JSON.stringify({ mcp: { proof: { command: "a" } } }))).toEqual({
      proof: { command: "a" },
    });
    expect(
      JSON.parse(
        config.write(JSON.stringify({ unrelated: true, mcp: { existing: {} } }), "proof", {
          command: "node",
        }),
      ),
    ).toEqual({ unrelated: true, mcp: { existing: {}, proof: { command: "node" } } });
  });

  it("creates the first declared table in an empty file, after defaults", () => {
    const config = nativeJsonMcpConfig("config.json", entry, {
      tableKeys: ["mcpServers", "mcp"],
      defaults: { schema_version: 1 },
    });
    expect(JSON.parse(config.write("", "proof", { command: "node" }))).toEqual({
      schema_version: 1,
      mcpServers: { proof: { command: "node" } },
    });
  });

  it("refuses a file that defines more than one declared table", () => {
    const config = nativeJsonMcpConfig("config.json", entry, {
      tableKeys: ["mcpServers", "mcp"],
    });
    const ambiguous = JSON.stringify({ mcp: {}, mcpServers: {} });
    expect(() => config.read(ambiguous)).toThrow("Ambiguous native MCP server tables");
    expect(() => config.write(ambiguous, "proof", { command: "node" })).toThrow(
      "Ambiguous native MCP server tables",
    );
  });
});
