import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport as ClientStdioTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServer } from "@/shared/contracts";

const CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";

function readConfig(): { server: McpServer; disabledTools: string[] } {
  const encoded = process.env[CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP filter configuration");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    server: McpServer;
    disabledTools: string[];
  };
}

function createUpstreamTransport(server: McpServer) {
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

async function main(): Promise<void> {
  const config = readConfig();
  const disabled = new Set(config.disabledTools);
  const client = new Client({ name: "poracode-mcp-filter", version: "1.0.0" });
  await client.connect(createUpstreamTransport(config.server) as Transport);

  const server = new Server(
    { name: config.server.name, version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools.filter((tool) => !disabled.has(tool.name)));
      cursor = result.nextCursor;
    } while (cursor);
    return { tools };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    if (disabled.has(name)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool disabled by Poracode: ${name}` }],
      };
    }
    return await client.callTool(request.params);
  });

  const close = async () => {
    await Promise.allSettled([server.close(), client.close()]);
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
  await server.connect(new StdioServerTransport());
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
