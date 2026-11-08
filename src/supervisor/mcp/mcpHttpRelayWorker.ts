// Standalone stdio entry point: bundled alone by tsdown and deployed into WSL
// as `mcp-relay.mjs`. The relay lives in mcpHttpRelay.ts so it can be tested
// in-process without spawning this worker.
import { startMcpHttpRelay } from "./mcpHttpRelay";
import { readMcpHttpRelayConfig } from "./mcpToolFilterConfig";

try {
  const relay = startMcpHttpRelay({
    config: readMcpHttpRelayConfig(process.env),
    input: process.stdin,
    output: process.stdout,
  });
  const stop = () => void relay.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  // Nothing should outlive the client; exit even if a socket lingers.
  void relay.closed.then(() => setTimeout(() => process.exit(0), 1_000).unref());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
