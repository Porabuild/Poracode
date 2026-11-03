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
import type { Tool, Transport } from "@modelcontextprotocol/server";
import { StdioClientTransport as ClientStdioTransport } from "@modelcontextprotocol/client/stdio";
import {
  Client,
  DEFAULT_REQUEST_TIMEOUT_MSEC,
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { McpServer } from "@/shared/contracts";
import { isMcpToolVisibleTo, MCP_APP_CLIENT_CAPABILITIES } from "@/shared/mcpAppResources";
import { McpAppSession } from "./McpAppSession";
import { materializeMcpAppResult } from "./mcpAppResult";
import type { BridgeToolResult } from "./toolBridge";

export interface FilterProxyOptions {
  serverName: string;
  disabledTools: readonly string[];
  upstreamTransport: Transport;
  downstreamTransport: Transport;
  timeoutMs?: number;
  isolateConnectionFailures?: boolean;
  /** Enable only when the connection owner supplies an isolated Apps renderer. */
  mcpApps?: boolean;
  onAppResult?(tool: Tool, result: BridgeToolResult): BridgeToolResult;
}

export interface FilterProxy {
  client: Client;
  server: Server;
  apps?: McpAppSession;
  close: () => Promise<void>;
}

export function createUpstreamTransport(server: Pick<McpServer, "transport">): Transport {
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
  const client = new Client(
    { name: "poracode-mcp-filter", version: "1.0.0" },
    { capabilities: options.mcpApps ? MCP_APP_CLIENT_CAPABILITIES : {} },
  );
  const apps = options.mcpApps
    ? new McpAppSession(client, {
        disabledTools: options.disabledTools,
        timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MSEC,
      })
    : undefined;
  let knownTools: Map<string, Tool> | undefined;
  let discoveryRevision = 0;
  client.setNotificationHandler("notifications/tools/list_changed", () => {
    knownTools = undefined;
    discoveryRevision += 1;
  });
  let upstreamUnavailable = false;
  const unavailableMessage = `MCP server "${serverName}" could not connect. Its tools are unavailable for this session. Fix its connection or sign-in, then start a new session to use them.`;
  const unavailableTools = {
    tools: [
      {
        name: "poracode_mcp_unavailable",
        description: unavailableMessage,
        inputSchema: { type: "object" as const },
      },
    ].filter((tool) => !disabled.has(tool.name)),
  };
  // Protocol.connect() chains a pre-existing transport.onclose, so install
  // this before connect: disconnects close downstream, or retain a diagnostic
  // server when the provider requires connection failure isolation.
  let proxyServer: Server | undefined;
  const upstreamOnClose = upstreamTransport.onclose;
  upstreamTransport.onclose = () => {
    apps?.close();
    upstreamOnClose?.();
    upstreamUnavailable = true;
    if (proxyServer && !options.isolateConnectionFailures) {
      void proxyServer.close().catch(() => undefined);
    }
  };
  const requestOptions = options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs };
  const upstreamReady = Promise.withResolvers<void>();
  // Startup can fail before a tools request arrives to observe this rejection.
  void upstreamReady.promise.catch(() => undefined);
  const server = new Server(
    { name: serverName, version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  proxyServer = server;
  const stopped = Promise.withResolvers<void>();
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= Promise.resolve().then(async () => {
      stopped.resolve();
      apps?.close();
      await Promise.allSettled([server.close(), client.close()]);
    });
    return closing;
  };
  const downstreamOnClose = downstreamTransport.onclose;
  downstreamTransport.onclose = () => {
    downstreamOnClose?.();
    void close();
  };
  server.setRequestHandler("tools/list", async () => {
    await upstreamReady.promise;
    if (options.isolateConnectionFailures && upstreamUnavailable) return unavailableTools;
    const tools: Tool[] = [];
    const discovered = new Map<string, Tool>();
    const revision = discoveryRevision;
    let cursor: string | undefined;
    try {
      do {
        const result = await client.listTools(cursor ? { cursor } : undefined, requestOptions);
        for (const tool of result.tools) discovered.set(tool.name, tool);
        tools.push(
          ...result.tools.filter(
            (tool) => !disabled.has(tool.name) && isMcpToolVisibleTo(tool, "model"),
          ),
        );
        cursor = result.nextCursor;
      } while (cursor);
      if (revision === discoveryRevision) knownTools = discovered;
    } catch (error) {
      if (!options.isolateConnectionFailures) throw error;
      upstreamUnavailable = true;
      await client.close().catch(() => undefined);
      return unavailableTools;
    }
    return { tools };
  });
  server.setRequestHandler("tools/call", async (request, extra) => {
    await upstreamReady.promise;
    const name = request.params.name;
    if (disabled.has(name)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool disabled by Poracode: ${name}` }],
      };
    }
    if (options.isolateConnectionFailures && upstreamUnavailable) {
      return { isError: true, content: [{ type: "text", text: unavailableMessage }] };
    }
    try {
      const callOptions = {
        ...requestOptions,
        signal: extra.mcpReq.signal,
      };
      let tools = knownTools;
      if (!tools || apps) {
        const revision = discoveryRevision;
        const result = await client.listTools(undefined, callOptions);
        tools = new Map(result.tools.map((tool) => [tool.name, tool]));
        if (revision === discoveryRevision) knownTools = tools;
      }
      const tool = tools.get(name);
      if (tool && !isMcpToolVisibleTo(tool, "model")) {
        return {
          isError: true,
          content: [{ type: "text", text: `Tool is not visible to the model: ${name}` }],
        };
      }
      const result = await client.callTool(request.params, callOptions);
      if (apps && tool) {
        const materialized = await materializeMcpAppResult(client, tool, result, {
          timeout: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MSEC,
          signal: extra.mcpReq.signal,
        });
        return options.onAppResult?.(tool, materialized) ?? materialized;
      }
      return result;
    } catch (error) {
      if (!options.isolateConnectionFailures || extra.mcpReq.signal.aborted) throw error;
      return {
        isError: true,
        content: [
          { type: "text", text: `MCP server "${serverName}" could not complete this tool call.` },
        ],
      };
    }
  });
  try {
    // Observe EOF before starting upstream I/O: transport.start() can wait
    // indefinitely before the SDK begins its initialize request timeout.
    await server.connect(downstreamTransport);
    if (closing) throw new Error("MCP proxy disconnected during startup");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const connected = (async () => {
        try {
          await client.connect(upstreamTransport, requestOptions);
        } finally {
          if (upstreamUnavailable || closing) await client.close().catch(() => undefined);
        }
      })();
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("MCP server connection timed out")),
          options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MSEC,
        );
      });
      await Promise.race([connected, deadline, stopped.promise]);
      if (closing) throw new Error("MCP proxy disconnected during startup");
    } catch (error) {
      upstreamUnavailable = true;
      await client.close().catch(() => undefined);
      if (closing || !options.isolateConnectionFailures) throw error;
    } finally {
      clearTimeout(timer);
    }
    upstreamReady.resolve();
    return { client, server, close, ...(apps ? { apps } : {}) };
  } catch (error) {
    upstreamReady.reject(error);
    await close();
    throw error;
  }
}
