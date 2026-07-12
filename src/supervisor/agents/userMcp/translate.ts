import { createHash } from "node:crypto";
import type { McpServer } from "@/shared/contracts";

export type ClaudeUserMcpServerConfig =
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
      timeout: number;
    }
  | {
      type: "http" | "sse";
      url: string;
      headers: Record<string, string>;
      timeout: number;
    };

export function buildClaudeUserMcpServers(
  servers: readonly McpServer[],
): Record<string, ClaudeUserMcpServerConfig> {
  return Object.fromEntries(
    servers.map((server) => {
      const transport = server.transport;
      if (transport.type === "stdio") {
        return [
          server.name,
          {
            type: "stdio" as const,
            command: transport.command,
            args: transport.args,
            env: transport.env,
            timeout: server.timeoutMs,
          },
        ];
      }
      return [
        server.name,
        {
          type: transport.type,
          url: transport.url,
          headers: transport.headers,
          timeout: server.timeoutMs,
        },
      ];
    }),
  );
}

export interface GeminiUserMcpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  httpUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout: number;
}

export function buildGeminiUserMcpServers(
  servers: readonly McpServer[],
): Record<string, GeminiUserMcpServerConfig> {
  const result: Record<string, GeminiUserMcpServerConfig> = {};
  for (const server of servers) {
    const transport = server.transport;
    if (transport.type === "stdio") {
      result[server.name] = {
        command: transport.command,
        args: transport.args,
        env: transport.env,
        ...(transport.cwd ? { cwd: transport.cwd } : {}),
        timeout: server.timeoutMs,
      };
    } else if (transport.type === "http") {
      result[server.name] = {
        httpUrl: transport.url,
        headers: transport.headers,
        timeout: server.timeoutMs,
      };
    } else {
      result[server.name] = {
        url: transport.url,
        headers: transport.headers,
        timeout: server.timeoutMs,
      };
    }
  }
  return result;
}

export type OpenCodeUserMcpServerConfig =
  | {
      type: "local";
      command: string[];
      cwd?: string;
      environment?: Record<string, string>;
      enabled: true;
      timeout: number;
    }
  | {
      type: "remote";
      url: string;
      headers?: Record<string, string>;
      enabled: true;
      timeout: number;
    };

export function buildOpenCodeUserMcp(
  servers: readonly McpServer[],
): Record<string, OpenCodeUserMcpServerConfig> {
  const result: Record<string, OpenCodeUserMcpServerConfig> = {};
  for (const server of servers) {
    const transport = server.transport;
    result[server.name] =
      transport.type === "stdio"
        ? {
            type: "local",
            command: [transport.command, ...transport.args],
            ...(transport.cwd ? { cwd: transport.cwd } : {}),
            ...(Object.keys(transport.env).length > 0 ? { environment: transport.env } : {}),
            enabled: true,
            timeout: server.timeoutMs,
          }
        : {
            type: "remote",
            url: transport.url,
            ...(Object.keys(transport.headers).length > 0 ? { headers: transport.headers } : {}),
            enabled: true,
            timeout: server.timeoutMs,
          };
  }
  return result;
}

export interface OpenCodeUserMcpLaunchConfig {
  configContent: string;
  env: Record<string, string>;
}

function openCodeMcpEnvVar(
  server: Pick<McpServer, "id" | "name">,
  kind: "ENV" | "HEADER",
  key: string,
): string {
  return `LIGHTCODE_MCP_OPENCODE_${envLabel(server.name, "SERVER")}_${envIdentityHash(server.name, server.id)}_${kind}_${envLabel(key, "VALUE")}_${envIdentityHash(kind, key)}`;
}

/**
 * Build OpenCode's per-process config overlay. Credential-bearing values stay
 * out of OPENCODE_CONFIG_CONTENT and are resolved by OpenCode from the child
 * process environment at launch time.
 */
export function buildOpenCodeUserMcpLaunchConfig(
  servers: readonly McpServer[],
): OpenCodeUserMcpLaunchConfig {
  const mcp = buildOpenCodeUserMcp(servers);
  const env: Record<string, string> = {};

  for (const server of servers) {
    const transport = server.transport;
    const config = mcp[server.name];
    if (!config) continue;

    if (transport.type === "stdio" && config.type === "local") {
      if (Object.keys(transport.env).length === 0) continue;
      config.environment = Object.fromEntries(
        Object.entries(transport.env).map(([key, value]) => {
          const envVar = openCodeMcpEnvVar(server, "ENV", key);
          env[envVar] = value;
          return [key, `{env:${envVar}}`];
        }),
      );
      continue;
    }

    if (transport.type !== "stdio" && config.type === "remote") {
      if (Object.keys(transport.headers).length === 0) continue;
      config.headers = Object.fromEntries(
        Object.entries(transport.headers).map(([key, value]) => {
          const envVar = openCodeMcpEnvVar(server, "HEADER", key);
          env[envVar] = value;
          return [key, `{env:${envVar}}`];
        }),
      );
    }
  }

  return { configContent: JSON.stringify({ mcp }), env };
}

export interface AcpNamedValue {
  name: string;
  value: string;
}

export type AcpUserMcpServerConfig =
  | { name: string; command: string; args: string[]; env: AcpNamedValue[] }
  | { type: "http" | "sse"; name: string; url: string; headers: AcpNamedValue[] };

function toNamedValues(record: Record<string, string>): AcpNamedValue[] {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

export function buildAcpUserMcpServers(servers: readonly McpServer[]): AcpUserMcpServerConfig[] {
  return servers.map((server) => {
    const transport = server.transport;
    if (transport.type === "stdio") {
      return {
        name: server.name,
        command: transport.command,
        args: transport.args,
        env: toNamedValues(transport.env),
      };
    }
    return {
      type: transport.type,
      name: server.name,
      url: transport.url,
      headers: toNamedValues(transport.headers),
    };
  });
}

function envTokenSegment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function envIdentityHash(...values: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

function envLabel(value: string, fallback: string): string {
  return (envTokenSegment(value) || fallback).slice(0, 32);
}

function codexMcpEnvPrefix(server: Pick<McpServer, "id" | "name">): string {
  return `LIGHTCODE_MCP_${envLabel(server.name, "SERVER")}_${envIdentityHash(server.name, server.id)}`;
}

export function codexMcpTokenEnvVar(server: Pick<McpServer, "id" | "name">): string {
  return `${codexMcpEnvPrefix(server)}_TOKEN`;
}

function codexMcpHeaderEnvVar(server: Pick<McpServer, "id" | "name">, headerName: string): string {
  return `${codexMcpEnvPrefix(server)}_HEADER_${envLabel(headerName, "VALUE")}_${envIdentityHash(headerName)}`;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlKeySegment(value: string): string {
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : tomlString(value);
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlInlineTable(record: Record<string, string>): string {
  return `{ ${Object.entries(record)
    .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
    .join(", ")} }`;
}

function bearerToken(headers: Record<string, string>): string | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "authorization") continue;
    return /^Bearer\s+(.+)$/iu.exec(value.trim())?.[1];
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
  let remoteClientEnabled = false;

  for (const server of servers) {
    const transport = server.transport;
    const key = `mcp_servers.${tomlKeySegment(server.name)}`;
    if (transport.type === "stdio") {
      args.push("-c", `${key}.command=${tomlString(transport.command)}`);
      if (transport.args.length > 0) {
        args.push("-c", `${key}.args=${tomlStringArray(transport.args)}`);
      }
      if (Object.keys(transport.env).length > 0) {
        args.push("-c", `${key}.env=${tomlInlineTable(transport.env)}`);
      }
      if (transport.cwd) args.push("-c", `${key}.cwd=${tomlString(transport.cwd)}`);
    } else {
      if (!remoteClientEnabled) {
        args.push("-c", "experimental_use_rmcp_client=true");
        remoteClientEnabled = true;
      }
      args.push("-c", `${key}.url=${tomlString(transport.url)}`);
      const token = bearerToken(transport.headers);
      const envHeaders: Record<string, string> = {};
      for (const [headerName, headerValue] of Object.entries(transport.headers)) {
        if (headerName.toLowerCase() === "authorization" && token) continue;
        const envVar = codexMcpHeaderEnvVar(server, headerName);
        envHeaders[headerName] = envVar;
        env[envVar] = headerValue;
      }
      if (Object.keys(envHeaders).length > 0) {
        args.push("-c", `${key}.env_http_headers=${tomlInlineTable(envHeaders)}`);
      }
      if (token) {
        const envVar = codexMcpTokenEnvVar(server);
        args.push("-c", `${key}.bearer_token_env_var=${tomlString(envVar)}`);
        env[envVar] = token;
      }
    }
    args.push("-c", `${key}.tool_timeout_sec=${Math.ceil(server.timeoutMs / 1000)}`);
  }

  return { args, env };
}
