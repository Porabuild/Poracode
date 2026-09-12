import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer, ProjectLocation } from "@/shared/contracts";
import { resolveNodeForDistro } from "../wsl/runtime";
import { deployFilesToWslTempBase, resolveWslHelpersDir } from "../wsl/wslDeploy";

const CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";

function filterConfig(server: McpServer): string {
  return Buffer.from(
    JSON.stringify({ server, disabledTools: server.disabledTools ?? [] }),
    "utf8",
  ).toString("base64url");
}

export async function prepareMcpToolFilters(
  servers: readonly McpServer[],
  location: ProjectLocation,
  options: { proxyStdioCwd?: boolean } = {},
): Promise<McpServer[]> {
  const needsProxy = (server: McpServer) =>
    (server.disabledTools?.length ?? 0) > 0 ||
    Boolean(options.proxyStdioCwd && server.transport.type === "stdio" && server.transport.cwd);
  if (!servers.some(needsProxy)) return [...servers];

  const helpersDir = resolveWslHelpersDir();
  const workerName = (server: McpServer) =>
    (server.disabledTools?.length ?? 0) > 0 ? "mcp-filter.mjs" : "mcp-stdio.mjs";
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
    const deployed = deployFilesToWslTempBase(
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
    const filtersTools = (server.disabledTools?.length ?? 0) > 0;
    const env: Record<string, string> = filtersTools
      ? { [CONFIG_ENV]: filterConfig(server) }
      : {
          PORACODE_MCP_STDIO_CONFIG: Buffer.from(JSON.stringify({ version: 1, server })).toString(
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
