import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export interface McpAppResource {
  uri: string;
  mimeType: typeof MCP_APP_MIME_TYPE;
  text: string;
}

export function readMcpAppResourceContent(value: unknown): McpAppResource | undefined {
  if (!value || typeof value !== "object") return;
  const resource = value as Record<string, unknown>;
  if (
    typeof resource.uri !== "string" ||
    !resource.uri.startsWith("ui://") ||
    typeof resource.mimeType !== "string" ||
    resource.mimeType.replace(/\s/g, "").toLowerCase() !== MCP_APP_MIME_TYPE
  )
    return;
  let text = resource.text;
  if (
    text === undefined &&
    typeof resource.blob === "string" &&
    resource.blob.length <= Math.ceil(MAX_INLINE_VISUAL_BYTES / 3) * 4
  ) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(resource.blob), (char) => char.charCodeAt(0)),
      );
    } catch {
      return;
    }
  }
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > MAX_INLINE_VISUAL_BYTES ||
    new TextEncoder().encode(text).length > MAX_INLINE_VISUAL_BYTES
  )
    return;
  // External CSP/permission/domain requests deliberately grant no authority.
  return { uri: resource.uri, mimeType: MCP_APP_MIME_TYPE, text };
}

/** Only standard embedded MCP resources qualify, never tool text or file URLs. */
export function readMcpAppResource(result: unknown): McpAppResource | undefined {
  if (!result || typeof result !== "object") return;
  const record = result as Record<string, unknown>;
  if (record.isError === true || !Array.isArray(record.content)) return;
  for (const block of record.content) {
    if (!block || typeof block !== "object" || block.type !== "resource") continue;
    const resource = readMcpAppResourceContent(block.resource);
    if (resource) return resource;
  }
  return;
}
