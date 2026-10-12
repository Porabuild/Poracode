import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { ensureWslDirectory, removeWslPath, writeWslTextFile } from "../plugin/wslStaging";
import type { Awaitable } from "../base";

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

export async function writeCopilotMcpConfig(
  location: ProjectLocation,
  sessionId: string,
  servers: readonly ResolvedMcpServer[],
): Promise<
  { argument: string; env: Record<string, string>; cleanup: () => Awaitable<void> } | undefined
> {
  if (servers.length === 0) return undefined;

  const safeSessionId = sessionId.replace(/[^A-Za-z0-9._-]/gu, "_");
  const directoryName = "poracode-copilot-mcp";
  const fileName = `${safeSessionId}-${randomUUID()}.json`;
  const linuxDirectory = `/tmp/${directoryName}`;
  const launch = buildCopilotMcpLaunchConfig(servers);

  if (location.kind === "wsl") {
    const distro = location.distro;
    const linuxFilePath = `${linuxDirectory}/${fileName}`;
    await ensureWslDirectory(distro, linuxDirectory, { mode: 0o700 });
    await writeWslTextFile(distro, linuxFilePath, `${JSON.stringify(launch.config, null, 2)}\n`, {
      mode: 0o600,
    });
    return {
      argument: `@${linuxFilePath}`,
      env: launch.env,
      cleanup: () => removeWslPath(distro, linuxFilePath),
    };
  }

  const filePath = join(tmpdir(), directoryName, fileName);
  mkdirSync(join(tmpdir(), directoryName), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(launch.config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    argument: `@${filePath}`,
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
