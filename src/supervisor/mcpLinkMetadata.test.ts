import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import type { BridgeTool } from "./mcp/toolBridge";
import {
  createMcpLinkMetadataResolvers,
  metadataToolArguments,
  parseMcpMetadataResult,
  selectMetadataTool,
} from "./mcpLinkMetadata";

const server = {
  id: "jira",
  name: "Jira",
  description: "Jira metadata",
  enabled: true,
  timeoutMs: 5_000,
  transport: { type: "stdio", command: "jira-mcp", args: [], env: {} },
} as McpServer;
const genericTool = {
  name: "link_metadata",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
  annotations: { readOnlyHint: true },
} as BridgeTool;
const jiraTool = {
  name: "jira_get_issue",
  inputSchema: { type: "object", properties: { issueKey: { type: "string" } } },
  annotations: { readOnlyHint: true },
} as BridgeTool;

describe("selectMetadataTool", () => {
  it("selects a read-only generic metadata tool", () => {
    expect(selectMetadataTool([genericTool], server, "https://example.test/docs")).toBe(
      genericTool,
    );
  });

  it("selects a Jira issue tool only for a matching server and Jira URL", () => {
    expect(
      selectMetadataTool([jiraTool], server, "https://yieldmo.atlassian.net/browse/SIT-2296"),
    ).toBe(jiraTool);
    expect(
      selectMetadataTool([jiraTool], server, "https://github.com/acme/repo/pull/1"),
    ).toBeNull();
    expect(
      selectMetadataTool(
        [{ ...jiraTool, annotations: { readOnlyHint: false } }],
        server,
        "https://yieldmo.atlassian.net/browse/SIT-2296",
      ),
    ).toBeNull();
  });
});

describe("metadataToolArguments", () => {
  it("uses the generic URL and Jira issue-key schemas", () => {
    expect(metadataToolArguments(genericTool, "https://example.test/docs")).toEqual({
      url: "https://example.test/docs",
    });
    expect(
      metadataToolArguments(jiraTool, "https://yieldmo.atlassian.net/browse/SIT-2296"),
    ).toEqual({
      issueKey: "SIT-2296",
    });
  });

  it("rejects an incompatible issue schema", () => {
    const incompatible = {
      ...jiraTool,
      inputSchema: { type: "object", properties: { project: { type: "string" } } },
    } as BridgeTool;
    expect(
      metadataToolArguments(incompatible, "https://yieldmo.atlassian.net/browse/SIT-2296"),
    ).toBeNull();
  });
});

describe("parseMcpMetadataResult", () => {
  it("reads structured metadata", () => {
    expect(
      parseMcpMetadataResult({
        structuredContent: { title: "A page", description: "A summary" },
      }),
    ).toEqual({ title: "A page", description: "A summary" });
  });

  it("reads Jira fields and JSON text content", () => {
    expect(
      parseMcpMetadataResult({
        content: [
          {
            type: "text",
            text: JSON.stringify({ fields: { summary: "[M9] Alert", description: "Details" } }),
          },
        ],
      }),
    ).toEqual({ title: "[M9] Alert", description: "Details" });
  });

  it("returns empty metadata for an unusable result", () => {
    expect(parseMcpMetadataResult(null)).toEqual({ title: null, description: null });
  });
});

describe("createMcpLinkMetadataResolvers", () => {
  it("labels MCP and plugin resolvers and skips disabled servers", () => {
    const [mcp] = createMcpLinkMetadataResolvers([server], "mcp");
    const [plugin] = createMcpLinkMetadataResolvers([{ ...server, enabled: false }], "plugin");
    expect(mcp!.kind).toBe("mcp");
    expect(mcp!.canResolve("https://example.test")).toBe(true);
    expect(plugin!.kind).toBe("plugin");
    expect(plugin!.canResolve("https://example.test")).toBe(false);
  });
});
