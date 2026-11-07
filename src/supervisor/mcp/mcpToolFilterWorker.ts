// Standalone stdio entry point: bundled alone by tsdown and deployed into WSL
// as `mcp-filter.mjs`. The proxy itself lives in mcpToolFilterProxy.ts so it
// can be tested in-process without spawning this worker.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  createUpstreamTransport,
  mcpStdioEnvironment,
  startFilterProxy,
} from "./mcpToolFilterProxy";
import { readMcpToolFilterConfig } from "./mcpToolFilterConfig";
import { startSchemaProxy } from "./mcpSchemaProxy";
import { McpFramedTransport, createFramedMcpChild } from "./mcpFramedTransport";

async function main(): Promise<void> {
  const config = readMcpToolFilterConfig(process.env);
  const downstreamTransport = config.schemaOnly
    ? new McpFramedTransport(process.stdin, process.stdout)
    : new StdioServerTransport();
  const source = config.server.transport;
  const upstreamTransport =
    config.schemaOnly &&
    source.type === "stdio" &&
    downstreamTransport instanceof McpFramedTransport
      ? createFramedMcpChild({
          command: source.command,
          args: source.args,
          env: mcpStdioEnvironment(source.env, true),
          ...(source.cwd ? { cwd: source.cwd } : {}),
          framing: () => downstreamTransport.framing,
        })
      : createUpstreamTransport(config.server);
  const proxy = config.schemaOnly
    ? await startSchemaProxy({
        upstreamTransport,
        downstreamTransport,
        timeoutMs: config.server.timeoutMs,
      })
    : await startFilterProxy({
        serverName: config.server.name,
        timeoutMs: config.server.timeoutMs,
        disabledTools: config.disabledTools,
        ...(config.isolateConnectionFailures ? { isolateConnectionFailures: true } : {}),
        ...(config.omitInvalidSchemaPatterns ? { omitInvalidSchemaPatterns: true } : {}),
        upstreamTransport,
        downstreamTransport,
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
