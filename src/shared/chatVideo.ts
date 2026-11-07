import { mimeForPath } from "./promptContent";
import type { CanonicalItemType } from "./contracts";

export interface ChatVideoSource {
  src: string;
  name?: string;
  mimeType?: string;
}

export function completedToolVideoSources(item: {
  type: CanonicalItemType;
  state: string;
  payload?: unknown;
}): ChatVideoSource[] {
  if (
    item.state !== "completed" ||
    ![
      "tool_call",
      "mcp_tool_call",
      "dynamic_tool_call",
      "image_view",
      "command_execution",
      "file_change",
      "web_search",
    ].includes(item.type)
  )
    return [];
  const payload = item.payload as { status?: unknown; result?: unknown } | undefined;
  return payload?.status === "success" ? readToolVideoSources(payload.result) : [];
}

export function isVideoPath(path: string, mimeType?: string): boolean {
  return (
    mimeType?.startsWith("video/") === true ||
    mimeForPath(path.split(/[?#]/u, 1)[0] ?? path)?.startsWith("video/") === true
  );
}

/** Only standard file references and web media URLs can reach a player. */
export function isChatVideoSource(src: string, mimeType?: string): boolean {
  if (!src) return false;
  for (const char of src) if (char.charCodeAt(0) < 32) return false;
  if (/^[a-z][a-z\d+.-]*:/iu.test(src) && !/^[a-z]:[\\/]/iu.test(src)) {
    if (!/^(https?:\/\/|file:\/\/|poracode-local:\/\/local\/)/iu.test(src)) return false;
  }
  return isVideoPath(src, mimeType);
}

export function chatVideoFilePath(src: string): string | undefined {
  if (!/^(file|poracode-local):\/\//iu.test(src)) return src;
  try {
    const url = new URL(src);
    const path = decodeURIComponent(url.pathname);
    if (url.protocol === "file:" && url.hostname && url.hostname !== "localhost") {
      return `//${url.hostname}${path}`;
    }
    return /^\/[a-z]:\//iu.test(path) ? path.slice(1) : path;
  } catch {
    return undefined;
  }
}

/** MCP resources stay in their existing result envelope; no new wire shape. */
export function readToolVideoSources(result: unknown): ChatVideoSource[] {
  if (!result || typeof result !== "object") return [];
  const content = Array.isArray(result) ? result : (result as { content?: unknown }).content;
  if ((result as { isError?: unknown }).isError === true || !Array.isArray(content)) return [];
  const videos: ChatVideoSource[] = [];
  const seen = new Set<string>();
  for (const value of content) {
    if (!value || typeof value !== "object") continue;
    const block = value as Record<string, unknown>;
    const resource =
      block.type === "resource" && block.resource && typeof block.resource === "object"
        ? (block.resource as Record<string, unknown>)
        : block.type === "resource_link"
          ? block
          : undefined;
    if (!resource || typeof resource.uri !== "string") continue;
    const src = resource.uri;
    const mimeType = typeof resource.mimeType === "string" ? resource.mimeType : undefined;
    if (!isChatVideoSource(src, mimeType) || seen.has(src)) continue;
    seen.add(src);
    videos.push({
      src,
      ...(typeof resource.name === "string" ? { name: resource.name } : {}),
      ...(mimeType ? { mimeType } : {}),
    });
  }
  return videos;
}
