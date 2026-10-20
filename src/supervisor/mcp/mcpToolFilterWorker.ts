// Standalone stdio entry point: bundled alone by tsdown and deployed into WSL
// as `mcp-filter.mjs`. The proxy itself lives in mcpToolFilterProxy.ts so it
// can be tested in-process without spawning this worker.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createUpstreamTransport, startFilterProxy } from "./mcpToolFilterProxy";
import { readMcpToolFilterConfig } from "./mcpToolFilterConfig";

async function main(): Promise<void> {
  const config = readMcpToolFilterConfig(process.env);
  const proxy = await startFilterProxy({
    serverName: config.server.name,
    timeoutMs: config.server.timeoutMs,
    disabledTools: config.disabledTools,
    ...(config.isolateConnectionFailures ? { isolateConnectionFailures: true } : {}),
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
