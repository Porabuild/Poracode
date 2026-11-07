import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MCP_APP_EXTENSION = "io.modelcontextprotocol/ui";

export const MCP_APP_CLIENT_CAPABILITIES = {
  extensions: { [MCP_APP_EXTENSION]: { mimeTypes: [MCP_APP_MIME_TYPE] } },
};

export interface McpAppResource {
  uri: string;
  mimeType: typeof MCP_APP_MIME_TYPE;
  text: string;
  /** Untrusted resource metadata; preserving a request does not grant it. */
  _meta?: Record<string, unknown>;
}

/** Visibility is enforced separately for the model and the app on the same server. */
export function isMcpToolVisibleTo(
  tool: { _meta?: Record<string, unknown> | undefined },
  audience: "model" | "app",
): boolean {
  const ui = tool._meta?.ui;
  if (ui === undefined) return true;
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) return false;
  const visibility = (ui as Record<string, unknown>).visibility;
  if (visibility === undefined) return true;
  return (
    Array.isArray(visibility) &&
    visibility.every((entry) => entry === "model" || entry === "app") &&
    visibility.includes(audience)
  );
}

export function mcpToolResourceUri(tool: {
  _meta?: Record<string, unknown> | undefined;
}): string | undefined {
  const ui = tool._meta?.ui;
  const uri =
    ui && typeof ui === "object" && !Array.isArray(ui)
      ? ((ui as Record<string, unknown>).resourceUri ?? tool._meta?.["ui/resourceUri"])
      : tool._meta?.["ui/resourceUri"];
  return typeof uri === "string" && uri.startsWith("ui://") ? uri : undefined;
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
  // Metadata is optional in the existing embedded-resource wire/persistence shape.
  // Old resources remain valid; sandbox policy is enforced by the host, not here.
  const meta = resource._meta;
  return {
    uri: resource.uri,
    mimeType: MCP_APP_MIME_TYPE,
    text,
    ...(meta && typeof meta === "object" && !Array.isArray(meta)
      ? { _meta: meta as Record<string, unknown> }
      : {}),
  };
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
