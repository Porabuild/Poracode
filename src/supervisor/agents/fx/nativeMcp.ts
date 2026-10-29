import { homedir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@/shared/contracts";
import type { NativeMcpConfigFile } from "../../mcp/nativeSetup/configFile";
import { nativeJsonMcpConfig } from "../../mcp/nativeSetup/jsonConfig";

/**
 * fx reports one invalid entry as an invalid profile, so every option fx would
 * refuse is rejected here instead of being written into `~/.fx/mcp.json`.
 */
export function fxNativeMcpConfig(path = join(homedir(), ".fx", "mcp.json")): NativeMcpConfigFile {
  return nativeJsonMcpConfig(path, fxNativeEntry, { tableKeys: ["mcpServers", "mcp"] });
}

const MAX_TIMEOUT_MS = 4_294_967_295;

const RESERVED_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "connection",
  "content-length",
  "content-type",
  "host",
  "last-event-id",
  "mcp-method",
  "mcp-name",
  "mcp-protocol-version",
  "mcp-session-id",
  "transfer-encoding",
]);

const HTTP_TOKEN_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/u;

/** Control characters other than tab, which HTTP allows inside values. */
function hasHeaderControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

function fxNativeEntry(server: McpServer): unknown {
  if (server.disabledTools?.length) {
    throw new Error("Tool restrictions are not supported by native setup");
  }
  if (server.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Timeout is too long for native setup");
  }

  const transport = server.transport;
  if (transport.type === "sse") {
    throw new Error("SSE is not supported by native setup");
  }
  if (transport.type === "stdio") {
    if (transport.cwd) throw new Error("Working directory is not supported by native setup");
    return {
      command: transport.command,
      ...(transport.args.length ? { args: transport.args } : {}),
      ...(Object.keys(transport.env).length ? { env: transport.env } : {}),
      startup_timeout_ms: server.timeoutMs,
      operation_timeout_ms: server.timeoutMs,
    };
  }

  let url: URL;
  try {
    url = new URL(transport.url);
  } catch {
    throw new Error("Insecure HTTP endpoints are not supported by native setup");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("Credentials or fragments in URLs are not supported by native setup");
  }
  const localHttp =
    url.protocol === "http:" &&
    url.port !== "" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Insecure HTTP endpoints are not supported by native setup");
  }

  const seen = new Set<string>();
  for (const [name, value] of Object.entries(transport.headers)) {
    const lower = name.toLowerCase();
    if (lower === "authorization") {
      throw new Error("Authorization headers are not supported by native setup");
    }
    if (RESERVED_HEADERS.has(lower) || lower.startsWith("mcp-param-")) {
      throw new Error("Reserved headers are not supported by native setup");
    }
    if (!HTTP_TOKEN_RE.test(name) || hasHeaderControlCharacter(value) || seen.has(lower)) {
      throw new Error("Headers fx cannot send are not supported by native setup");
    }
    seen.add(lower);
  }

  return {
    type: "http",
    url: transport.url,
    ...(Object.keys(transport.headers).length ? { headers: transport.headers } : {}),
    startup_timeout_ms: server.timeoutMs,
    operation_timeout_ms: server.timeoutMs,
  };
}
