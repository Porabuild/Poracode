import { describe, expect, it } from "vitest";
import {
  BUILT_IN_MCP_SERVER_TOOL_COUNTS,
  builtInMcpServerDisabledSchema,
  discoverExternalMcpServersPayloadSchema,
  isReservedMcpServerName,
  isValidMcpServerName,
  mcpExternalServerCandidateSchema,
  mcpServerSchema,
  mergeMcpServers,
  resolveEnabledMcpServers,
  type McpServer,
} from "./mcpServer";
import { TOOLS as browserTools } from "@/main/browser/mcp/tools/specs";
import { CHROME_TOOLS as chromeTools } from "@/main/browser/external/chromeTools";
import { TOOLS as computerUseTools } from "@/main/computer-use/mcp/toolRegistry";
import { TOOLS as appControlsTools } from "@/main/app-controls/mcp/toolRegistry";
import { TOOLS as subagentTools } from "@/supervisor/subagentMcp/toolRegistry";

function server(id: string, name: string, enabled = true): McpServer {
  return {
    id,
    name,
    description: "",
    enabled,
    timeoutMs: 30_000,
    transport: { type: "stdio", command: "node", args: [], env: {} },
  };
}

describe("mcpServerSchema", () => {
  it("normalizes defaults for a canonical stdio server", () => {
    expect(
      mcpServerSchema.parse({
        id: "one",
        name: "my-server",
        transport: { type: "stdio", command: "node" },
      }),
    ).toEqual({
      id: "one",
      name: "my-server",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: [], env: {} },
    });
  });

  it("protects all provider-visible built-in names case-insensitively", () => {
    expect(isReservedMcpServerName("PoRaCoDe")).toBe(true);
    expect(isReservedMcpServerName("computer_use")).toBe(true);
    expect(isValidMcpServerName("browser")).toBe(false);
    expect(isValidMcpServerName("custom.server")).toBe(true);
    expect(
      mcpServerSchema.safeParse({
        id: "reserved",
        name: "Chrome",
        transport: { type: "http", url: "https://example.test/mcp" },
      }).success,
    ).toBe(false);
  });

  it("accepts a sparse built-in disable map", () => {
    expect(builtInMcpServerDisabledSchema.parse({})).toEqual({});
    expect(builtInMcpServerDisabledSchema.parse({ browser: true })).toEqual({ browser: true });
  });

  it("keeps built-in tool counts aligned with the advertised catalogs", () => {
    expect(BUILT_IN_MCP_SERVER_TOOL_COUNTS).toEqual({
      browser: browserTools.length,
      subagents: subagentTools.length,
      chrome: chromeTools.length,
      "computer-use": computerUseTools.length,
      "app-controls": appControlsTools.length,
    });
  });
});

describe("external MCP discovery contracts", () => {
  it("requires workspace locations and rejects locations for host-only user discovery", () => {
    const projectLocation = { kind: "windows", path: "C:\\workspace" } as const;
    expect(discoverExternalMcpServersPayloadSchema.safeParse({ sourceScope: "user" }).success).toBe(
      true,
    );
    expect(
      discoverExternalMcpServersPayloadSchema.safeParse({
        sourceScope: "user",
        projectLocation,
      }).success,
    ).toBe(false);
    expect(
      discoverExternalMcpServersPayloadSchema.safeParse({ sourceScope: "workspace" }).success,
    ).toBe(false);
    expect(
      discoverExternalMcpServersPayloadSchema.safeParse({
        sourceScope: "workspace",
        projectLocation,
      }).success,
    ).toBe(true);
  });

  it("accepts only the supported external candidate reasons", () => {
    const candidate = {
      id: "external-one",
      name: "external-one",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node" },
    };
    for (const unsupportedReason of ["authentication", "tool-restrictions", "sensitive-values"]) {
      expect(
        mcpExternalServerCandidateSchema.safeParse({ ...candidate, unsupportedReason }).success,
      ).toBe(true);
    }
    expect(
      mcpExternalServerCandidateSchema.safeParse({
        ...candidate,
        unsupportedReason: "unknown",
      }).success,
    ).toBe(false);
  });
});

describe("MCP resolution", () => {
  it("lets a project entry override a global entry case-insensitively", () => {
    const merged = mergeMcpServers(
      [server("global", "Memory"), server("other", "docs")],
      [server("project", "memory", false)],
    );
    expect(merged.map((item) => item.id)).toEqual(["project", "other"]);
    expect(resolveEnabledMcpServers(merged).map((item) => item.name)).toEqual(["docs"]);
  });
});
