import type { Client } from "@modelcontextprotocol/client";
import {
  mcpToolResourceUri,
  readMcpAppResource,
  readMcpAppResourceContent,
  type McpAppResource,
} from "@/shared/mcpAppResources";
import type { BridgeTool, BridgeToolResult } from "./toolBridge";

type ResourceClient = Pick<Client, "readResource"> & Partial<Pick<Client, "listResources">>;

export async function readMcpToolResource(
  client: ResourceClient,
  tool: BridgeTool,
  options: { timeout: number; signal?: AbortSignal },
): Promise<McpAppResource | undefined> {
  const uri = mcpToolResourceUri(tool);
  if (!uri) return;
  const result = await client.readResource({ uri }, options);
  const resource = result.contents
    .filter((content) => content.uri === uri)
    .map(readMcpAppResourceContent)
    .find((content) => content !== undefined);
  if (!resource || resource._meta?.ui !== undefined || !client.listResources) return resource;
  // Content metadata wins. The spec also allows policy on resources/list,
  // while UI-only resources may be omitted from that list altogether.
  try {
    const listing = await client.listResources(undefined, options);
    const ui = listing.resources.find((entry) => entry.uri === uri)?._meta?.ui;
    if (ui !== undefined) return { ...resource, _meta: { ...resource._meta, ui } };
  } catch {
    // A listing is optional; a successfully read declared resource stays usable.
  }
  return resource;
}

/** Materialize the declared resource on the SAME credential-owning connection. */
export async function materializeMcpAppResult(
  client: ResourceClient,
  tool: BridgeTool,
  result: BridgeToolResult,
  options: { timeout: number; signal?: AbortSignal },
): Promise<BridgeToolResult> {
  if (result.isError || readMcpAppResource(result)) return result;
  const uri = mcpToolResourceUri(tool);
  if (!uri) return result;
  try {
    const resource = await readMcpToolResource(client, tool, options);
    if (!resource) return result;
    return { ...result, content: [...result.content, { type: "resource", resource }] };
  } catch {
    // Resource discovery is progressive enhancement; keep the tool's real result.
    return result;
  }
}
