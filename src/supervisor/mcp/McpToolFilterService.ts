import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { resolveNodeForDistro } from "../wsl/runtime";
import { deployFilesToWslTempBase, resolveWslHelpersDir } from "../wsl/wslDeploy";
import {
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  MCP_FILTER_CONFIG_V2_ENV,
  MCP_STDIO_CONFIG_ENV,
} from "./mcpToolFilterConfig";

interface FilterOptions {
  remoteViaStdio?: boolean;
  proxyStdioCwd?: boolean;
  isolateConnectionFailures?: boolean;
  omitInvalidSchemaPatterns?: boolean;
}

function requiresFiltering(server: ResolvedMcpServer, options: FilterOptions): boolean {
  return (
    options.isolateConnectionFailures === true ||
    (server.disabledTools?.length ?? 0) > 0 ||
    (options.remoteViaStdio === true && server.transport.type !== "stdio")
  );
}

function filterConfig(server: ResolvedMcpServer, options: FilterOptions): string {
  return Buffer.from(
    JSON.stringify({
      ...(options.omitInvalidSchemaPatterns
        ? {
            version: 2,
            omitInvalidSchemaPatterns: true,
            // New native wrappers preserve the rest of the protocol and stdio
            // environment; existing filtering lanes retain their old policy.
            ...(!requiresFiltering(server, options) ? { schemaOnly: true } : {}),
          }
        : options.isolateConnectionFailures
          ? { version: 1 }
          : {}),
      ...(options.isolateConnectionFailures ? { isolateConnectionFailures: true } : {}),
      server,
      disabledTools: server.disabledTools ?? [],
    }),
    "utf8",
  ).toString("base64url");
}

export async function prepareMcpToolFilters<T extends ResolvedMcpServer>(
  servers: readonly T[],
  location: ProjectLocation,
  options: FilterOptions = {},
): Promise<T[]> {
  const needsProxy = (server: T) =>
    options.omitInvalidSchemaPatterns === true ||
    options.isolateConnectionFailures === true ||
    (server.disabledTools?.length ?? 0) > 0 ||
    (options.remoteViaStdio === true && server.transport.type !== "stdio") ||
    Boolean(options.proxyStdioCwd && server.transport.type === "stdio" && server.transport.cwd);
  if (!servers.some(needsProxy)) return [...servers];

  const helpersDir = resolveWslHelpersDir();
  const workerName = (server: ResolvedMcpServer) =>
    options.omitInvalidSchemaPatterns === true || requiresFiltering(server, options)
      ? "mcp-filter.mjs"
      : "mcp-stdio.mjs";
  const names = [...new Set(servers.filter(needsProxy).map(workerName))];
  const sources = names.map((name) => ({ name, path: helpersDir ? join(helpersDir, name) : "" }));
  if (sources.some((source) => !source.path || !existsSync(source.path))) {
    throw new Error("Poracode MCP launch helper is unavailable.");
  }

  let command = process.execPath;
  let workerDirectory = helpersDir!;
  const baseEnv = process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
  if (location.kind === "wsl") {
    const node = await resolveNodeForDistro(location.distro);
    const deployed = await deployFilesToWslTempBase(
      location.distro,
      `poracode-mcp-filter-${process.pid}`,
      sources.map((source) => ({ src: source.path, relDest: `mcp-filter/${source.name}` })),
    );
    if (!deployed) throw new Error("Poracode MCP launch helper could not be deployed to WSL.");
    command = node.nodePath;
    workerDirectory = `${deployed.linuxBaseDir}/mcp-filter`;
  }

  return servers.map((server) => {
    if (!needsProxy(server)) return server;
    const filtersTools = workerName(server) === "mcp-filter.mjs";
    const env: Record<string, string> = filtersTools
      ? {
          [options.omitInvalidSchemaPatterns
            ? MCP_FILTER_CONFIG_V2_ENV
            : options.isolateConnectionFailures
              ? MCP_FILTER_CONFIG_V1_ENV
              : MCP_FILTER_CONFIG_ENV]: filterConfig(server, options),
        }
      : {
          [MCP_STDIO_CONFIG_ENV]: Buffer.from(JSON.stringify({ version: 1, server })).toString(
            "base64url",
          ),
        };
    return {
      ...server,
      transport: {
        type: "stdio",
        command,
        args: [
          location.kind === "wsl"
            ? `${workerDirectory}/${workerName(server)}`
            : join(workerDirectory, workerName(server)),
        ],
        env: { ...baseEnv, ...env },
        ...(location.kind === "wsl" ? { cwd: location.linuxPath } : { cwd: location.path }),
      },
    };
  });
}
