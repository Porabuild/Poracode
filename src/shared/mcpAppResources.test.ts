import { describe, expect, it } from "vitest";
import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";
import {
  MCP_APP_MIME_TYPE,
  readMcpAppResource,
  readMcpAppResourceContent,
} from "./mcpAppResources";

const resource = { uri: "ui://fixture/chart", mimeType: MCP_APP_MIME_TYPE, text: "<h1>Chart</h1>" };

describe("MCP App resources", () => {
  it("reads the standard embedded resource without granting its requested permissions", () => {
    expect(
      readMcpAppResource({
        content: [
          {
            type: "resource",
            resource: {
              ...resource,
              _meta: {
                ui: {
                  domain: "app.test",
                  permissions: { camera: {} },
                  csp: { connectDomains: ["https://app.test"] },
                },
              },
            },
          },
        ],
      }),
    ).toEqual(resource);
    expect(
      readMcpAppResourceContent({
        ...resource,
        mimeType: "text/html; profile=mcp-app",
        text: undefined,
        blob: btoa(resource.text),
      }),
    ).toEqual(resource);
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
