import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";

type CopilotMcpServer =
  | {
      type: "stdio";
      command: string;
      args: string[];
      tools: ["*"];
      env?: Record<string, string>;
      cwd?: string;
      timeout: number;
    }
  | {
      type: "http" | "sse";
      url: string;
      tools: ["*"];
      headers?: Record<string, string>;
      timeout: number;
    };

export interface CopilotMcpLaunchConfig {
  config: { mcpServers: Record<string, CopilotMcpServer> };
  env: Record<string, string>;
}

function valueEnvName(server: ResolvedMcpServer, field: string): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([server.id, server.name, field]))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  return `PORACODE_COPILOT_MCP_${hash}`;
}

function protectedValues(
  server: ResolvedMcpServer,
  kind: "env" | "header",
  values: Record<string, string>,
  launchEnv: Record<string, string>,
): Record<string, string> | undefined {
  const entries = Object.entries(values).map(([name, value]) => {
    const envName = valueEnvName(server, `${kind}:${name}`);
    launchEnv[envName] = value;
    return [name, `\${${envName}}`] as const;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function buildCopilotMcpLaunchConfig(
  servers: readonly ResolvedMcpServer[],
): CopilotMcpLaunchConfig {
  const env: Record<string, string> = {};
  const mcpServers: Record<string, CopilotMcpServer> = {};

  for (const server of servers) {
    const transport = server.transport;
    if (transport.type === "stdio") {
      const protectedEnv = protectedValues(server, "env", transport.env, env);
      mcpServers[server.name] = {
        type: "stdio",
        command: transport.command,
        args: transport.args,
        tools: ["*"],
        ...(protectedEnv ? { env: protectedEnv } : {}),
        ...(transport.cwd ? { cwd: transport.cwd } : {}),
        timeout: server.timeoutMs,
      };
    } else {
      const protectedHeaders = protectedValues(server, "header", transport.headers, env);
      mcpServers[server.name] = {
        type: transport.type,
        url: transport.url,
        tools: ["*"],
        ...(protectedHeaders ? { headers: protectedHeaders } : {}),
        timeout: server.timeoutMs,
      };
    }
  }

  return { config: { mcpServers }, env };
}

export function writeCopilotMcpConfig(
  location: ProjectLocation,
  sessionId: string,
  servers: readonly ResolvedMcpServer[],
): { argument: string; env: Record<string, string>; cleanup: () => void } | undefined {
  if (servers.length === 0) return undefined;

  const safeSessionId = sessionId.replace(/[^A-Za-z0-9._-]/gu, "_");
  const directoryName = "poracode-copilot-mcp";
  const fileName = `${safeSessionId}-${randomUUID()}.json`;
  const linuxDirectory = `/tmp/${directoryName}`;
  const filePath =
    location.kind === "wsl"
      ? toWslUncPath(location.distro, `${linuxDirectory}/${fileName}`)
      : join(tmpdir(), directoryName, fileName);
  const directoryPath =
    location.kind === "wsl"
      ? toWslUncPath(location.distro, linuxDirectory)
      : join(tmpdir(), directoryName);
  const argumentPath = location.kind === "wsl" ? `${linuxDirectory}/${fileName}` : filePath;
  const launch = buildCopilotMcpLaunchConfig(servers);

  mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(launch.config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    argument: `@${argumentPath}`,
    env: launch.env,
    cleanup: () => {
      try {
        unlinkSync(filePath);
      } catch {
        // The temp file may already have been removed by external cleanup.
      }
    },
  };
}
