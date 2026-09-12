import {
  mcpServerSchema,
  type McpServer,
  type McpTransport,
  type Project,
  type ProjectLocation,
} from "@/shared/contracts";
import type {
  RemoteMcpSettingsCommand,
  RemoteMcpSettingsScope,
} from "@/shared/remote/contract/routeSchemas";
import type { SharedSettings } from "@/shared/settings";
import {
  REDACTED_VALUE,
  redactMcpServer,
  restoreRedactedTransport,
} from "../app-controls/mcp/tools/settings";
import { RemoteHttpError } from "./auth";

export interface RemoteMcpSettingsGateway {
  read(): { servers: McpServer[] };
  command(command: RemoteMcpSettingsCommand): { servers: McpServer[] };
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
  writeGlobalServers(servers: McpServer[]): void;
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
      switch (command.kind) {
        case "upsert":
          upsert(command.scope, command.server, dependencies);
          break;
        case "remove":
          remove(command.scope, command.serverId, dependencies);
          break;
        case "move":
          move(command.source, command.destination, command.serverId, dependencies);
          break;
      }
      return read();
    },
  };
}

function upsert(
  scope: RemoteMcpSettingsScope,
  incoming: McpServer,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): void {
  const servers = readScope(scope, dependencies);
  const existing = servers.find((server) => server.id === incoming.id);
  const transport = existing
    ? restoreRedactedTransport(incoming.transport, existing.transport)
    : incoming.transport;
  if (containsRedaction(transport)) {
    throw badRequest("mcp_redaction_without_existing_secret");
  }
  const server = mcpServerSchema.parse({ ...incoming, transport });
  if (
    servers.some((candidate) => candidate.id !== server.id && sameName(candidate.name, server.name))
  ) {
    throw badRequest("mcp_duplicate_name");
  }
  writeScope(
    scope,
    existing
      ? servers.map((candidate) => (candidate.id === server.id ? server : candidate))
      : [...servers, server],
    dependencies,
  );
}

function remove(
  scope: RemoteMcpSettingsScope,
  serverId: string,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): void {
  const servers = readScope(scope, dependencies);
  const next = servers.filter((server) => server.id !== serverId);
  if (next.length === servers.length) throw notFound();
  writeScope(scope, next, dependencies);
}

function move(
  source: RemoteMcpSettingsScope,
  destination: RemoteMcpSettingsScope,
  serverId: string,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): void {
  if (sameScope(source, destination)) throw badRequest("mcp_same_scope");
  const sourceServers = readScope(source, dependencies);
  const server = sourceServers.find((candidate) => candidate.id === serverId);
  if (!server) throw notFound();

  const destinationServers = readScope(destination, dependencies);
  const sameID = destinationServers.find((candidate) => candidate.id === server.id);
  if (sameID && !sameServer(sameID, server)) {
    throw badRequest("mcp_duplicate_id");
  }
  if (
    destinationServers.some(
      (candidate) => candidate.id !== server.id && sameName(candidate.name, server.name),
    )
  ) {
    throw badRequest("mcp_duplicate_name");
  }

  // Destination first: an interrupted cross-store operation can duplicate a
  // server, but never lose its credential-bearing configuration. A retry sees
  // the matching id and completes the source removal idempotently.
  if (!sameID) writeScope(destination, [...destinationServers, server], dependencies);
  writeScope(
    source,
    sourceServers.filter((candidate) => candidate.id !== server.id),
    dependencies,
  );
}

function readScope(
  scope: RemoteMcpSettingsScope,
  dependencies: RemoteMcpSettingsGatewayDependencies,
): McpServer[] {
  if (scope.kind === "global") return dependencies.readSettings().mcpServers;
  return requireProject(scope.projectId, dependencies).mcpServers ?? [];
}

function writeScope(
  scope: RemoteMcpSettingsScope,
  servers: McpServer[],
  dependencies: RemoteMcpSettingsGatewayDependencies,
): void {
  if (scope.kind === "global") {
    dependencies.writeGlobalServers(servers);
    return;
  }
  const project = requireProject(scope.projectId, dependencies);
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

function containsRedaction(transport: McpTransport): boolean {
  return JSON.stringify(transport).includes(REDACTED_VALUE);
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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
