import { describe, expect, it, vi } from "vitest";
import { materializeMcpAppResult, readMcpToolResource } from "./mcpAppResult";
import { registerMcpBridgeTools, type BridgeTool, type BridgeToolCall } from "./toolBridge";
import { MCP_APP_MIME_TYPE, readMcpAppResource } from "@/shared/mcpAppResources";

describe("MCP Apps resource discovery", () => {
  it("preserves declared source and tool data without advertising an interactive Apps host", async () => {
    const calls: BridgeToolCall[] = [];
    const names: string[] = [];
    const close = await registerMcpBridgeTools(
      [
        {
          id: "fixture",
          name: "fixture",
          timeoutMs: 5000,
          transport: {
            type: "stdio",
            command: process.execPath,
            args: [
              "-e",
              `
        let ui = false;
        require('node:readline').createInterface({input:process.stdin}).on('line', line => {
          const m=JSON.parse(line); if(m.id===undefined) return;
          let result;
          if(m.method==='initialize') {
            ui=!!m.params.capabilities.extensions?.['io.modelcontextprotocol/ui']?.mimeTypes.includes('text/html;profile=mcp-app');
            result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{},resources:{}},serverInfo:{name:'fixture',version:'1'}};
          } else if(m.method==='tools/list') {
            result={tools:[{name:'chart',inputSchema:{type:'object'},_meta:{ui:{resourceUri:'ui://fixture/chart'}}},{name:'hidden',inputSchema:{type:'object'},_meta:{ui:{visibility:['app']}}}]};
          } else if(m.method==='resources/read') {
            result={contents:[{uri:m.params.uri,mimeType:'text/html;profile=mcp-app',text:'<h1>Interactive</h1>'}]};
          } else result={content:[{type:'text',text:'Chart ready'}],structuredContent:{ui,value:42}};
          process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
        });
      `,
            ],
            env: {},
          },
        },
      ],
      {
        clientName: "poracode-fixture",
        appResources: true,
        register(_server, tool, call) {
          names.push(tool.name);
          calls.push(call);
        },
        onError() {
          throw new Error("Fixture connection failed");
        },
      },
    );
    try {
      expect(names).toEqual(["chart"]);
      const result = await calls[0]!({});
      expect(result.structuredContent).toEqual({ ui: false, value: 42 });
      expect(readMcpAppResource(result)?.text).toBe("<h1>Interactive</h1>");
    } finally {
      await close();
    }
  });

  it("keeps old result shapes valid and never fetches undeclared or non-ui resources", async () => {
    const readResource = vi
      .fn<() => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>>()
      .mockRejectedValue(new Error("Offline"));
    const client = { readResource };
    const result = { content: [{ type: "text" as const, text: "Existing result" }] };
    for (const uri of [undefined, "https://host.test/private", "file:///private"]) {
      const tool: BridgeTool = {
        name: "chart",
        inputSchema: { type: "object" },
        _meta: { ui: { resourceUri: uri } },
      };
      expect(await materializeMcpAppResult(client, tool, result, { timeout: 1000 })).toBe(result);
    }
    expect(readResource).not.toHaveBeenCalled();
    const tool: BridgeTool = {
      name: "chart",
      inputSchema: { type: "object" },
      _meta: { ui: { resourceUri: "ui://fixture/chart" } },
    };
    expect(await materializeMcpAppResult(client, tool, result, { timeout: 1000 })).toBe(result);
    const isError = { ...result, isError: true };
    expect(await materializeMcpAppResult(client, tool, isError, { timeout: 1000 })).toBe(isError);
    expect(readResource).toHaveBeenCalledTimes(1);
    readResource.mockResolvedValue({
      contents: [{ uri: "ui://other", mimeType: MCP_APP_MIME_TYPE, text: "<b>Other</b>" }],
    });
    expect(await materializeMcpAppResult(client, tool, result, { timeout: 1000 })).toBe(result);
  });

  it("uses listing policy only when resource content has no UI metadata", async () => {
    const tool: BridgeTool = {
      name: "chart",
      inputSchema: { type: "object" },
      _meta: { ui: { resourceUri: "ui://fixture/chart" } },
    };
    const resource = {
      uri: "ui://fixture/chart",
      mimeType: MCP_APP_MIME_TYPE,
      text: "<h1>Chart</h1>",
      _meta: { author: "fixture" },
    };
    const ui = { csp: { resourceDomains: ["https://cdn.test"] }, prefersBorder: true };
    const readResource = vi.fn<() => Promise<{ contents: (typeof resource)[] }>>(async () => ({
      contents: [resource],
    }));
    const listResources = vi.fn<
      () => Promise<{ resources: { uri: string; name: string; _meta: { ui: typeof ui } }[] }>
    >(async () => ({
      resources: [{ uri: resource.uri, name: "Chart", _meta: { ui } }],
    }));
    const client = { readResource, listResources };
    expect(await readMcpToolResource(client, tool, { timeout: 1000 })).toEqual({
      ...resource,
      _meta: { author: "fixture", ui },
    });
    listResources.mockClear();
    const withContentPolicy = {
      ...resource,
      _meta: { ...resource._meta, ui: { prefersBorder: false } },
    };
    readResource.mockResolvedValue({ contents: [withContentPolicy] });
    expect(await readMcpToolResource(client, tool, { timeout: 1000 })).toEqual(withContentPolicy);
    expect(listResources).not.toHaveBeenCalled();
    readResource.mockResolvedValue({ contents: [resource] });
    listResources.mockResolvedValue({ resources: [] });
    expect(await readMcpToolResource(client, tool, { timeout: 1000 })).toEqual(resource);
    listResources.mockRejectedValue(new Error("Listing unavailable"));
    expect(await readMcpToolResource(client, tool, { timeout: 1000 })).toEqual(resource);
  });
});
