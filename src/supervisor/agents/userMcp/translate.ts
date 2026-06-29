/**
 * Translate Lightcode's canonical {@link McpServer} list into each agent's
 * native MCP config shape. This generalizes the browser-MCP injection path
 * (see `src/supervisor/agents/browserMcp`) to arbitrary user-defined servers.
 *
 * Every function here is a pure mapping: callers are responsible for filtering
 * to the enabled servers that apply to the target agent (see
 * `resolveMcpServersForAgent` in `contracts/mcpServer`). The browser server is
 * still appended separately by each adapter, so these maps never include it.
 */

import type { McpServer } from "@/shared/contracts";

// ---------------------------------------------------------------------------
// Claude Agent SDK (`mcpServers` record). Supports stdio / sse / http.
// ---------------------------------------------------------------------------

export type ClaudeMcpServerConfig =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { type: "sse"; url: string; headers: Record<string, string> }
  | { type: "http"; url: string; headers: Record<string, string> };

export function buildClaudeUserMcpServers(
  servers: readonly McpServer[],
): Record<string, ClaudeMcpServerConfig> {
  const out: Record<string, ClaudeMcpServerConfig> = {};
  for (const server of servers) {
    const t = server.transport;
    if (t.type === "stdio") {
      out[server.name] = { type: "stdio", command: t.command, args: t.args, env: t.env };
    } else {
      out[server.name] = { type: t.type, url: t.url, headers: t.headers };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gemini CLI (`mcpServers` record). httpUrl = streamable HTTP, url = SSE.
// ---------------------------------------------------------------------------

export interface GeminiMcpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  httpUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export function buildGeminiUserMcpServers(
  servers: readonly McpServer[],
): Record<string, GeminiMcpServerEntry> {
  const out: Record<string, GeminiMcpServerEntry> = {};
  for (const server of servers) {
    const t = server.transport;
    if (t.type === "stdio") {
      out[server.name] = { command: t.command, args: t.args, env: t.env };
    } else if (t.type === "http") {
      out[server.name] = { httpUrl: t.url, headers: t.headers, timeout: 30_000 };
    } else {
      out[server.name] = { url: t.url, headers: t.headers, timeout: 30_000 };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// OpenCode SDK (`mcp` record). local = stdio, remote = streamable HTTP/SSE.
// ---------------------------------------------------------------------------

export type OpenCodeMcpServerConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string>; enabled: boolean }
  | { type: "remote"; url: string; headers?: Record<string, string>; enabled: boolean };

export function buildOpenCodeUserMcp(
  servers: readonly McpServer[],
): Record<string, OpenCodeMcpServerConfig> {
  const out: Record<string, OpenCodeMcpServerConfig> = {};
  for (const server of servers) {
    const t = server.transport;
    if (t.type === "stdio") {
      out[server.name] = {
        type: "local",
        command: [t.command, ...t.args],
        ...(Object.keys(t.env).length > 0 ? { environment: t.env } : {}),
        enabled: true,
      };
    } else {
      out[server.name] = {
        type: "remote",
        url: t.url,
        ...(Object.keys(t.headers).length > 0 ? { headers: t.headers } : {}),
        enabled: true,
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ACP (`mcpServers[]`). stdio has no `type` discriminator; http/sse do.
// ---------------------------------------------------------------------------

export interface AcpNamedValue {
  name: string;
  value: string;
}

export type AcpMcpServerConfig =
  | { name: string; command: string; args: string[]; env: AcpNamedValue[] }
  | { type: "http"; name: string; url: string; headers: AcpNamedValue[] }
  | { type: "sse"; name: string; url: string; headers: AcpNamedValue[] };

function toNamedValues(record: Record<string, string>): AcpNamedValue[] {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

export function buildAcpUserMcpServers(servers: readonly McpServer[]): AcpMcpServerConfig[] {
  return servers.map((server): AcpMcpServerConfig => {
    const t = server.transport;
    if (t.type === "stdio") {
      return { name: server.name, command: t.command, args: t.args, env: toNamedValues(t.env) };
    }
    return { type: t.type, name: server.name, url: t.url, headers: toNamedValues(t.headers) };
  });
}

// ---------------------------------------------------------------------------
// Codex CLI (`-c mcp_servers.*` overrides + companion env for remote tokens).
// ---------------------------------------------------------------------------

function envTokenSegment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

/** Env var name that carries the bearer token for a remote Codex MCP server. */
export function codexMcpTokenEnvVar(server: Pick<McpServer, "id" | "name">): string {
  const name = envTokenSegment(server.name) || "SERVER";
  const id = envTokenSegment(server.id) || "ID";
  return `LIGHTCODE_MCP_${name}_${id}_TOKEN`;
}

function tomlString(value: string): string {
  // TOML basic strings share JSON's escaping for the characters we care about.
  return JSON.stringify(value);
}

function tomlKeySegment(value: string): string {
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : tomlString(value);
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlInlineTable(record: Record<string, string>): string {
  const entries = Object.entries(record).map(
    ([key, value]) => `${tomlString(key)} = ${tomlString(value)}`,
  );
  return `{ ${entries.join(", ")} }`;
}

function bearerToken(headers: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      const match = /^Bearer\s+(.+)$/iu.exec(value.trim());
      return match?.[1];
    }
  }
  return undefined;
}

export interface CodexUserMcp {
  args: string[];
  env: Record<string, string>;
}

export function buildCodexUserMcp(servers: readonly McpServer[]): CodexUserMcp {
  const args: string[] = [];
  const env: Record<string, string> = {};
  let rmcpEnabled = false;

  for (const server of servers) {
    const t = server.transport;
    const key = `mcp_servers.${tomlKeySegment(server.name)}`;
    if (t.type === "stdio") {
      args.push("-c", `${key}.command=${tomlString(t.command)}`);
      if (t.args.length > 0) args.push("-c", `${key}.args=${tomlStringArray(t.args)}`);
      if (Object.keys(t.env).length > 0) args.push("-c", `${key}.env=${tomlInlineTable(t.env)}`);
      continue;
    }
    // Remote (http/sse) — Codex speaks both via the rmcp client.
    if (!rmcpEnabled) {
      args.push("-c", `experimental_use_rmcp_client=true`);
      rmcpEnabled = true;
    }
    args.push("-c", `${key}.url=${tomlString(t.url)}`);
    const token = bearerToken(t.headers);
    if (token) {
      const envVar = codexMcpTokenEnvVar(server);
      args.push("-c", `${key}.bearer_token_env_var=${tomlString(envVar)}`);
      env[envVar] = token;
    }
  }

  return { args, env };
}
