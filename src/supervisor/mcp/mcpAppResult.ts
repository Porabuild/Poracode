import type { Client } from "@modelcontextprotocol/client";
import { readMcpAppResource, readMcpAppResourceContent } from "@/shared/mcpAppResources";
import type { BridgeTool, BridgeToolResult } from "./toolBridge";

/** Materialize the declared resource on the SAME credential-owning connection. */
export async function materializeMcpAppResult(
  client: Pick<Client, "readResource">,
  tool: BridgeTool,
  result: BridgeToolResult,
  options: { timeout: number; signal?: AbortSignal },
): Promise<BridgeToolResult> {
  if (result.isError || readMcpAppResource(result)) return result;
  const ui = tool._meta?.ui as { resourceUri?: unknown } | undefined;
  const uri = ui?.resourceUri;
  if (typeof uri !== "string" || !uri.startsWith("ui://")) return result;
  try {
    const resourceResult = await client.readResource({ uri }, options);
    const resource = resourceResult.contents
      .filter((content) => content.uri === uri)
      .map(readMcpAppResourceContent)
      .find((content) => content !== undefined);
    if (!resource) return result;
    return { ...result, content: [...result.content, { type: "resource", resource }] };
  } catch {
    // Resource discovery is progressive enhancement; keep the tool's real result.
    return result;
  }
}
