import { z } from "zod";
import {
  mcpProbeEnvironmentSchema,
  mcpProbeResultSchema,
  mcpServerSchema,
  type McpProbeEnvironment,
  type McpProbeResult,
} from "@/shared/contracts/mcpServer";
import { probeMcpServer, unavailableMcpProbeResult } from "./probeMcpServer";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const inputSchema = z.object({
  server: mcpServerSchema,
  environment: mcpProbeEnvironmentSchema,
});
const fallbackEnvironment: McpProbeEnvironment = { runtime: "wsl", projectScoped: true };

async function readInput(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) {
      throw new Error("probe input is too large");
    }
  }
  return input;
}

function writeResult(result: McpProbeResult): void {
  process.stdout.write(JSON.stringify(mcpProbeResultSchema.parse(result)));
}

async function main(): Promise<void> {
  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(JSON.parse(await readInput()));
  } catch {
    writeResult(
      unavailableMcpProbeResult(
        "invalid-config",
        fallbackEnvironment,
        "The MCP server configuration is invalid.",
      ),
    );
    return;
  }
  writeResult(await probeMcpServer(parsed.server, parsed.environment));
}

void main().catch(() => {
  writeResult(unavailableMcpProbeResult("probe-unavailable", fallbackEnvironment));
});
