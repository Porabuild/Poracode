// Protocol notes (v2 SDK: @modelcontextprotocol/client, /server, /core 2.0.0).
// Each leg negotiates the highest mutually supported version independently
// (both sides offer 2025-11-25 down to 2024-10-07; previously v1 offered a
// 2026 draft), so the upstream and downstream legs may settle on different
// versions. tools/call params and results pass through untouched
// (structuredContent/isError/_meta preserved); tools/list is re-aggregated
// into a single page, so upstream cursors and result _meta are not forwarded.
// The v2 client auto-aggregates cursor pages when called without a cursor,
// validates structuredContent against a tool's advertised outputSchema (a
// violating upstream result throws instead of passing through), and returns an
// empty list without any request when upstream omits the tools capability. The
// low-level Server (string-method setRequestHandler) suffices for this
// pass-through proxy, so no McpServer tool registration is needed.
import { Server } from "@modelcontextprotocol/server";
import type { Transport } from "@modelcontextprotocol/server";
import { StdioClientTransport as ClientStdioTransport } from "@modelcontextprotocol/client/stdio";
import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { McpServer } from "@/shared/contracts";

export interface FilterProxyOptions {
  serverName: string;
  disabledTools: readonly string[];
  upstreamTransport: Transport;
  downstreamTransport: Transport;
}

export interface FilterProxy {
  client: Client;
  server: Server;
  close: () => Promise<void>;
}

export function createUpstreamTransport(server: McpServer): Transport {
  const transport = server.transport;
  if (transport.type === "stdio") {
    return new ClientStdioTransport({
      command: transport.command,
      args: transport.args,
      env: transport.env,
      ...(transport.cwd ? { cwd: transport.cwd } : {}),
      stderr: "inherit",
    });
  }
  if (transport.type === "http") {
    return new StreamableHTTPClientTransport(new URL(transport.url), {
      requestInit: { headers: transport.headers },
    });
  }
  return new SSEClientTransport(new URL(transport.url), {
    requestInit: { headers: transport.headers },
  });
}

export async function startFilterProxy(options: FilterProxyOptions): Promise<FilterProxy> {
  const { serverName, upstreamTransport, downstreamTransport } = options;
  const disabled = new Set(options.disabledTools);
  const client = new Client({ name: "poracode-mcp-filter", version: "1.0.0" });
  // Protocol.connect() chains a pre-existing transport.onclose, so install
  // this before connect: when the upstream server goes away the proxy closes
  // its downstream transport instead of leaving the agent CLI hanging.
  let proxyServer: Server | undefined;
  const upstreamOnClose = upstreamTransport.onclose;
  upstreamTransport.onclose = () => {
    upstreamOnClose?.();
    if (proxyServer) void proxyServer.close().catch(() => undefined);
  };
  await client.connect(upstreamTransport);

  const server = new Server(
    { name: serverName, version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  proxyServer = server;
  server.setRequestHandler("tools/list", async () => {
    const tools = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools.filter((tool) => !disabled.has(tool.name)));
      cursor = result.nextCursor;
    } while (cursor);
    return { tools };
  });
  server.setRequestHandler("tools/call", async (request) => {
    const name = request.params.name;
    if (disabled.has(name)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool disabled by Poracode: ${name}` }],
      };
    }
    return await client.callTool(request.params);
  });
  await server.connect(downstreamTransport);

  const close = async () => {
    await Promise.allSettled([server.close(), client.close()]);
  };
  return { client, server, close };
}
