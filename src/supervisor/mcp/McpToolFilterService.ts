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
): Promise<McpServer[]> {
  if (!servers.some((server) => (server.disabledTools?.length ?? 0) > 0)) return [...servers];

  const helpersDir = resolveWslHelpersDir();
  const workerSource = helpersDir ? join(helpersDir, "mcp-filter.mjs") : "";
  if (!workerSource || !existsSync(workerSource)) {
    throw new Error("Poracode MCP tool filter is unavailable.");
  }

  let command = process.execPath;
  let workerPath = workerSource;
  const baseEnv = process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
  if (location.kind === "wsl") {
    const node = await resolveNodeForDistro(location.distro);
    const deployed = deployFilesToWslTempBase(
      location.distro,
      `poracode-mcp-filter-${process.pid}`,
      [{ src: workerSource, relDest: "mcp-filter/mcp-filter.mjs" }],
    );
    if (!deployed) throw new Error("Poracode MCP tool filter could not be deployed to WSL.");
    command = node.nodePath;
    workerPath = `${deployed.linuxBaseDir}/mcp-filter/mcp-filter.mjs`;
  }

  return servers.map((server) => {
    if ((server.disabledTools?.length ?? 0) === 0) return server;
    return {
      ...server,
      transport: {
        type: "stdio",
        command,
        args: [workerPath],
        env: { ...baseEnv, [CONFIG_ENV]: filterConfig(server) },
        ...(location.kind === "wsl" ? { cwd: location.linuxPath } : { cwd: location.path }),
      },
    };
  });
}
