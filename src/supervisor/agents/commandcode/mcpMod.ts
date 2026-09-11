import type { ResolvedMcpServer } from "@/shared/contracts";
import {
  mcpBridgeToolName,
  registerMcpBridgeTools,
  type BridgeTool,
  type BridgeToolResult,
} from "../../mcp/toolBridge";

export { mcpBridgeToolName as commandCodeMcpToolName } from "../../mcp/toolBridge";

/** Public Command Code ModApi subset, verified against Command Code 1.53.0. */
export interface CommandCodeModApi {
  addTool(tool: {
    schema: { name: string; description: string; input_schema: BridgeTool["inputSchema"] };
    readOnly: false;
    run(input: { input: Record<string, unknown>; signal?: AbortSignal }): Promise<unknown>;
  }): { dispose(): void };
  ui: { notify(message: string): void };
}

export function commandCodeToolResult(result: BridgeToolResult): unknown {
  if (result.isError) {
    return {
      ok: false,
      error:
        result.content
          .filter((entry) => entry.type === "text")
          .map((entry) => entry.text)
          .join("\n") || "MCP tool failed",
    };
  }
  const content: unknown[] = result.content.map((entry) => {
    if (entry.type === "text") return { type: "text", text: entry.text };
    if (entry.type === "image") {
      return {
        type: "image",
        source: { type: "base64", media_type: entry.mimeType, data: entry.data },
      };
    }
    return { type: "text", text: JSON.stringify(entry) };
  });
  if (result.structuredContent)
    content.push({ type: "text", text: JSON.stringify(result.structuredContent) });
  return { ok: true, content };
}

export function registerCommandCodeMcpTools(
  cmd: CommandCodeModApi,
  servers: readonly ResolvedMcpServer[],
): Promise<() => Promise<void>> {
  return registerMcpBridgeTools(servers, {
    clientName: "poracode-commandcode",
    register(server, tool, call) {
      const registration = cmd.addTool({
        schema: {
          name: mcpBridgeToolName(server.name, tool.name),
          description: tool.description ?? tool.name,
          input_schema: {
            ...tool.inputSchema,
            properties: tool.inputSchema.properties ?? {},
            required: tool.inputSchema.required ?? [],
          },
        },
        // Match native MCP: remote annotations cannot grant plan-mode access.
        readOnly: false,
        run: async ({ input, signal }) => commandCodeToolResult(await call(input, signal)),
      });
      return () => registration.dispose();
    },
    onError: (server) => cmd.ui.notify(`Poracode could not connect MCP server ${server.name}.`),
  });
}

export default async function poracodeMcpMod(cmd: CommandCodeModApi): Promise<void> {
  const encoded = process.env.PORACODE_COMMANDCODE_MCP;
  if (!encoded) return;
  // Versioned, ephemeral launch envelope; never read a persisted config here.
  const config = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    version: number;
    servers: ResolvedMcpServer[];
  };
  if (config.version !== 1) throw new Error("Unsupported Poracode MCP launch configuration");
  await registerCommandCodeMcpTools(cmd, config.servers);
}
