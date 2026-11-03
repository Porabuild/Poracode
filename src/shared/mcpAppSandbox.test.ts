import { describe, expect, it } from "vitest";
import { buildMcpAppCsp, readMcpAppCsp } from "./mcpAppSandbox";
import { readMcpAppReference, MCP_APP_HOST_META_KEY } from "./contracts/mcpApps";

describe("MCP App sandbox policy", () => {
  it("grants only declared origins and forces an opaque script-only sandbox", () => {
    const policy = buildMcpAppCsp({
      connectDomains: ["https://api.example.com", "wss://events.example.com"],
      resourceDomains: ["https://*.example.com"],
      frameDomains: ["https://frames.example.com"],
      baseUriDomains: ["https://base.example.com"],
    });
    expect(policy).toContain("sandbox allow-scripts;");
    expect(policy).not.toMatch(/allow-same-origin|allow-popups|allow-top-navigation|'self'/u);
    expect(policy).toContain("connect-src https://api.example.com wss://events.example.com");
    expect(policy).toContain("script-src 'unsafe-inline' https://*.example.com");
    expect(policy).toContain("frame-src https://frames.example.com");
    expect(policy).toContain("base-uri https://base.example.com");
  });

  it("refuses directive injection, credentials, non-network schemes and malformed domains", () => {
    for (const domain of [
      "*",
      "'self'",
      "data:",
      "file:///etc/passwd",
      "https://good.test; connect-src *",
      "https://good.test\nhttps://other.test",
      "https://user:secret@example.com",
      "https://example.com/path",
      "https://example.com?query",
      "https://example.com#fragment",
      "https://bad\\host.test",
    ]) {
      expect(readMcpAppCsp({ connectDomains: [domain] })).toEqual({ connectDomains: [] });
    }
    expect(buildMcpAppCsp(undefined)).toContain("connect-src 'none'");
    expect(buildMcpAppCsp(undefined)).toContain("frame-src 'none'");
    expect(
      buildMcpAppCsp(undefined)
        .split("; ")
        .find((directive) => directive.startsWith("frame-src")),
    ).not.toContain("blob:");
    expect(readMcpAppCsp({ resourceDomains: ["wss://events.example.com"] })).toEqual({
      resourceDomains: [],
    });
  });
});

describe("MCP App reference compatibility", () => {
  it("keeps historical, foreign and future references inert", () => {
    const reference = {
      version: 1,
      sessionId: "b4325167-a276-420f-bd51-a46d8e4bfa39",
      toolName: "deployment",
      resourceUri: "ui://fixture/deployment",
    };
    expect(readMcpAppReference({ _meta: { [MCP_APP_HOST_META_KEY]: reference } })).toEqual(
      reference,
    );
    for (const result of [
      undefined,
      {},
      { content: [] },
      { _meta: { ui: reference } },
      { _meta: { [MCP_APP_HOST_META_KEY]: { ...reference, version: 2 } } },
      {
        _meta: {
          [MCP_APP_HOST_META_KEY]: { ...reference, resourceUri: "https://external.test/app" },
        },
      },
    ])
      expect(readMcpAppReference(result)).toBeUndefined();
  });
});
