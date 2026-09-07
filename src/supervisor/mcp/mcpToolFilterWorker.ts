// Standalone stdio entry point: bundled alone by tsdown and deployed into WSL
// as `mcp-filter.mjs`. The proxy itself lives in mcpToolFilterProxy.ts so it
// can be tested in-process without spawning this worker.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { McpServer } from "@/shared/contracts";
import { createUpstreamTransport, startFilterProxy } from "./mcpToolFilterProxy";

const CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";

function readConfig(): { server: McpServer; disabledTools: string[] } {
  const encoded = process.env[CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP filter configuration");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    server: McpServer;
    disabledTools: string[];
  };
}

async function main(): Promise<void> {
  const config = readConfig();
  const proxy = await startFilterProxy({
    serverName: config.server.name,
    disabledTools: config.disabledTools,
    upstreamTransport: createUpstreamTransport(config.server),
    downstreamTransport: new StdioServerTransport(),
  });

  const close = async () => {
    await proxy.close();
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
