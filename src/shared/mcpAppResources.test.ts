import { describe, expect, it } from "vitest";
import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";
import {
  MCP_APP_MIME_TYPE,
  isMcpToolVisibleTo,
  mcpToolResourceUri,
  readMcpAppResource,
  readMcpAppResourceContent,
} from "./mcpAppResources";

const resource = { uri: "ui://fixture/chart", mimeType: MCP_APP_MIME_TYPE, text: "<h1>Chart</h1>" };

describe("MCP App resources", () => {
  it("preserves untrusted resource policy metadata for the host to enforce", () => {
    const _meta = {
      ui: {
        domain: "app.test",
        permissions: { camera: {} },
        csp: { connectDomains: ["https://app.test"] },
      },
    };
    expect(
      readMcpAppResource({
        content: [
          {
            type: "resource",
            resource: {
              ...resource,
              _meta,
            },
          },
        ],
      }),
    ).toEqual({ ...resource, _meta });
  });

  it("keeps previous resource shapes and binary contents valid", () => {
    expect(readMcpAppResource({ content: [{ type: "resource", resource }] })).toEqual(resource);
    expect(
      readMcpAppResourceContent({
        ...resource,
        mimeType: "text/html; profile=mcp-app",
        text: undefined,
        blob: btoa(resource.text),
      }),
    ).toEqual(resource);
    for (const _meta of [null, "invalid", []]) {
      expect(readMcpAppResourceContent({ ...resource, _meta })).toEqual(resource);
    }
  });

  it("does not treat ordinary HTML, remote references, failed calls, or text as apps", () => {
    for (const result of [
      { content: [{ type: "text", text: JSON.stringify(resource) }] },
      { content: [{ type: "resource_link", ...resource }] },
      {
        content: [
          { type: "resource", resource: { ...resource, uri: "file:///private/chart.html" } },
        ],
      },
      { content: [{ type: "resource", resource: { ...resource, mimeType: "text/html" } }] },
      { isError: true, content: [{ type: "resource", resource }] },
    ])
      expect(readMcpAppResource(result)).toBeUndefined();
  });

  it("bounds decoded UTF-8 bytes and rejects invalid binary resources", () => {
    expect(
      readMcpAppResourceContent({ ...resource, text: "é".repeat(MAX_INLINE_VISUAL_BYTES / 2 + 1) }),
    ).toBeUndefined();
    expect(
      readMcpAppResourceContent({ ...resource, text: undefined, blob: "invalid!base64" }),
    ).toBeUndefined();
    expect(
      readMcpAppResourceContent({ ...resource, text: undefined, blob: "/w==" }),
    ).toBeUndefined();
  });
});

describe("MCP App tool metadata", () => {
  it("defaults tools to both audiences and honors explicit visibility", () => {
    for (const audience of ["model", "app"] as const) {
      expect(isMcpToolVisibleTo({}, audience)).toBe(true);
      expect(isMcpToolVisibleTo({ _meta: { ui: {} } }, audience)).toBe(true);
      expect(isMcpToolVisibleTo({ _meta: { ui: { visibility: [audience] } } }, audience)).toBe(
        true,
      );
      const other = audience === "model" ? "app" : "model";
      expect(isMcpToolVisibleTo({ _meta: { ui: { visibility: [other] } } }, audience)).toBe(false);
      for (const visibility of [[], null, "app", ["app", "unknown"], [true]]) {
        expect(isMcpToolVisibleTo({ _meta: { ui: { visibility } } }, audience)).toBe(false);
      }
      for (const ui of [null, [], "invalid"]) {
        expect(isMcpToolVisibleTo({ _meta: { ui } }, audience)).toBe(false);
      }
    }
  });

  it("accepts only declared ui resources", () => {
    expect(mcpToolResourceUri({ _meta: { ui: { resourceUri: resource.uri } } })).toBe(resource.uri);
    expect(mcpToolResourceUri({ _meta: { "ui/resourceUri": resource.uri } })).toBe(resource.uri);
    expect(
      mcpToolResourceUri({
        _meta: { ui: { resourceUri: resource.uri }, "ui/resourceUri": "ui://old" },
      }),
    ).toBe(resource.uri);
    for (const resourceUri of [undefined, "https://app.test", "file:///private", true]) {
      expect(mcpToolResourceUri({ _meta: { ui: { resourceUri } } })).toBeUndefined();
    }
    expect(mcpToolResourceUri({})).toBeUndefined();
    expect(mcpToolResourceUri({ _meta: { ui: [] } })).toBeUndefined();
  });
});
