import type { ResolvedMcpServer } from "@/shared/contracts";
import {
  mcpBridgeToolName,
  registerMcpBridgeTools,
  type BridgeTool,
  type BridgeToolResult,
} from "../../mcp/toolBridge";

/** Public Pi extension API subset; parameter schemas are JSON Schema objects. */
export interface PiMcpExtensionApi {
  on(event: "session_shutdown", handler: (event: { reason: string }) => void | Promise<void>): void;
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: BridgeTool["inputSchema"];
    execute(id: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  }): void;
}

export function piMcpToolResult(result: BridgeToolResult) {
  if (result.isError) {
    throw new Error(
      result.content
        .filter((entry) => entry.type === "text")
        .map((entry) => entry.text)
        .join("\n") || "MCP tool failed",
    );
  }
  const content = result.content.map((entry) =>
    entry.type === "text" || entry.type === "image"
      ? entry
      : { type: "text" as const, text: JSON.stringify(entry) },
  );
  if (result.structuredContent)
    content.push({ type: "text", text: JSON.stringify(result.structuredContent) });
  return { content, details: result };
}

export function registerPiMcpTools(pi: PiMcpExtensionApi, servers: readonly ResolvedMcpServer[]) {
  return registerMcpBridgeTools(servers, {
    clientName: "poracode-pi",
    register(server, tool, call) {
      pi.registerTool({
        name: mcpBridgeToolName(server.name, tool.name),
        label: `${server.name}: ${tool.title ?? tool.name}`,
        description: tool.description ?? tool.name,
        parameters: tool.inputSchema,
        execute: async (_id, input, signal) => piMcpToolResult(await call(input, signal)),
      });
    },
    onError: (server) => console.error(`Poracode could not connect MCP server ${server.name}.`),
  });
}

export default async function poracodeMcpExtension(pi: PiMcpExtensionApi): Promise<void> {
  const encoded = process.env.PORACODE_PI_MCP;
  if (!encoded) return;
  const config = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    version: number;
    servers: ResolvedMcpServer[];
  };
  if (config.version !== 1) throw new Error("Unsupported Poracode MCP launch configuration");
  const close = await registerPiMcpTools(pi, config.servers);
  pi.on("session_shutdown", ({ reason }) => {
    // Native session switches retain the extension host; /reload replaces it.
    return reason === "reload" || reason === "quit" ? close() : undefined;
  });
}
