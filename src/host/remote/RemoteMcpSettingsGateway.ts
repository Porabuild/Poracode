import { type McpServer, type Project, type ProjectLocation } from "@/shared/contracts";
import type {
  RemoteMcpSettingsCommand,
  RemoteMcpSettingsScope,
} from "@/shared/remote/contract/routeSchemas";
import type { SharedSettings } from "@/shared/settings";
import { redactMcpServer, sameMcpServerName, upsertMcpServerDefinition } from "@/host/mcpSettings";
import { RemoteHttpError } from "./auth";

export interface RemoteMcpSettingsGateway {
  read(): { servers: McpServer[] };
  command(command: RemoteMcpSettingsCommand): Promise<{ servers: McpServer[] }>;
  resolveScope(scope: RemoteMcpSettingsScope): {
    servers: McpServer[];
    projectLocation?: ProjectLocation;
  };
  resolveServer(
    scope: RemoteMcpSettingsScope,
    serverId: string,
  ): {
    server: McpServer;
    projectLocation?: ProjectLocation;
  };
}

export interface RemoteMcpSettingsGatewayDependencies {
  readSettings(): SharedSettings;
  editGlobalServers(edit: (current: McpServer[]) => McpServer[]): Promise<void>;
  readProject(projectId: string): Project | null | undefined;
  writeProject(project: Project): void;
  projectsChanged(): void;
}

/**
 * Host-owned custom MCP settings boundary.
 *
 * Reads preserve the shape needed by native editors while masking every
 * credential-bearing value. Updates restore unchanged mask markers from the
 * stored server, and scope moves copy the unredacted server entirely on-host.
 */
export function createRemoteMcpSettingsGateway(
  dependencies: RemoteMcpSettingsGatewayDependencies,
): RemoteMcpSettingsGateway {
  const read = () => ({
    servers: dependencies.readSettings().mcpServers.map(redactMcpServer),
  });

  const resolveScope = (scope: RemoteMcpSettingsScope) => {
    if (scope.kind === "global") {
      return { servers: dependencies.readSettings().mcpServers };
    }
    const project = requireProject(scope.projectId, dependencies);
    return { servers: project.mcpServers ?? [], projectLocation: project.location };
  };

  // Serialize cross-scope moves with other remote changes to either list.
  let pending = Promise.resolve();
  return {
    read,
    resolveScope,
    resolveServer(scope, serverId) {
      const resolved = resolveScope(scope);
      const server = resolved.servers.find((candidate) => candidate.id === serverId);
      if (!server) throw notFound();
      return {
        server,
        ...(resolved.projectLocation ? { projectLocation: resolved.projectLocation } : {}),
      };
    },
    command(command) {
      const result = pending.then(async () => {
        switch (command.kind) {
          case "upsert":
            await editScope(command.scope, dependencies, (servers) =>
              upsertMcpServerDefinition(servers, command.server, badRequest),
            );
            break;
          case "remove":
            await editScope(command.scope, dependencies, (servers) =>
              remove(servers, command.serverId),
            );
            break;
          case "move":
            await move(command.source, command.destination, command.serverId, dependencies);
            break;
        }
        return read();
      });
      pending = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function remove(servers: McpServer[], serverId: string): McpServer[] {
  const next = servers.filter((server) => server.id !== serverId);
  if (next.length === servers.length) throw notFound();
  return next;
}

async function move(
  source: RemoteMcpSettingsScope,
  destination: RemoteMcpSettingsScope,
  serverId: string,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): Promise<void> {
  if (sameScope(source, destination)) throw badRequest("mcp_same_scope");
  const sourceServers = readScope(source, dependencies);
  const server = sourceServers.find((candidate) => candidate.id === serverId);
  if (!server) throw notFound();

  // Destination first: an interrupted cross-store operation can duplicate a
  // server, but never lose its credential-bearing configuration. A retry sees
  // the matching id and completes the source removal idempotently.
  await editScope(destination, dependencies, (servers) => {
    const sameID = servers.find((candidate) => candidate.id === server.id);
    if (sameID && !sameServer(sameID, server)) throw badRequest("mcp_duplicate_id");
    if (
      servers.some(
        (candidate) => candidate.id !== server.id && sameMcpServerName(candidate.name, server.name),
      )
    )
      throw badRequest("mcp_duplicate_name");
    return sameID ? servers : [...servers, server];
  });
  await editScope(source, dependencies, (servers) => {
    const current = servers.find((candidate) => candidate.id === server.id);
    if (!current) return servers;
    if (!sameServer(current, server)) {
      throw new RemoteHttpError(
        "mcp_move_conflict",
        "The source MCP server changed during the move.",
        409,
      );
    }
    return remove(servers, server.id);
  });
}

function readScope(
  scope: RemoteMcpSettingsScope,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): McpServer[] {
  if (scope.kind === "global") return dependencies.readSettings().mcpServers;
  return requireProject(scope.projectId, dependencies).mcpServers ?? [];
}

async function editScope(
  scope: RemoteMcpSettingsScope,
  dependencies: RemoteMcpSettingsGatewayDependencies,
  edit: (current: McpServer[]) => McpServer[],
): Promise<void> {
  if (scope.kind === "global") {
    await dependencies.editGlobalServers(edit);
    return;
  }
  const project = requireProject(scope.projectId, dependencies);
  const before = project.mcpServers ?? [];
  const servers = edit(before);
  if (servers === before) return;
  dependencies.writeProject({ ...project, mcpServers: servers });
  dependencies.projectsChanged();
}

function requireProject(
  projectId: string,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): Project {
  const project = dependencies.readProject(projectId);
  if (!project) {
    throw new RemoteHttpError("mcp_project_not_found", "Project not found.", 404);
  }
  return project;
}

function sameScope(left: RemoteMcpSettingsScope, right: RemoteMcpSettingsScope): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === "global" || (right.kind === "project" && left.projectId === right.projectId))
  );
}

function sameServer(left: McpServer, right: McpServer): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function badRequest(code: string): RemoteHttpError {
  return new RemoteHttpError(code, "The MCP server change is invalid.", 400);
}

function notFound(): RemoteHttpError {
  return new RemoteHttpError("mcp_server_not_found", "MCP server not found.", 404);
}
