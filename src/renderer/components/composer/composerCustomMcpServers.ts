import { toast } from "@heroui/react";
import type { McpServer, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { saveProjectMcpServers } from "@/renderer/actions/projectActions";
import {
  sharedSettingsServerPersistence,
  updateServerRow,
  type McpServersSink,
} from "@/renderer/components/mcp/mcpServersMutation";
import { loadAuthoritativeProjectMcpServers } from "@/renderer/state/projectSettings/projectSettingsLoader";
import type { ComposerCustomMcpItem } from "./ComposerMcpServersMenu";

/**
 * Tail of the in-flight toggle commits per scope. Each commit is a read of the
 * scope's current list followed by an absolute-list save, so two overlapping
 * toggles would both read the same list and the later save would drop the
 * earlier change; chaining makes each read see the previous save.
 */
const commitTails = new Map<string, Promise<void>>();

function commitInOrder(scopeKey: string, commit: () => Promise<void>): Promise<void> {
  const next = (commitTails.get(scopeKey) ?? Promise.resolve()).then(commit);
  const tail = next.catch(() => undefined);
  commitTails.set(scopeKey, tail);
  void tail.then(() => {
    if (commitTails.get(scopeKey) === tail) commitTails.delete(scopeKey);
  });
  return next;
}

/**
 * Composer rows for user-configured MCP servers (Global + this project's
 * workspace scope). Toggling flips the server's persistent `enabled` flag — the
 * same switch as the MCP Servers settings page — and commits it against the
 * scope's CURRENT list, never this render's projection, so a stale or
 * not-yet-loaded project list can't overwrite the host's configuration.
 */
export function composerCustomMcpItems(input: {
  /** The merged rows to show, already filtered by the caller. */
  servers: readonly McpServer[];
  userServers: McpServer[];
  projectServers: readonly McpServer[];
  projectId: string;
  projectLocation: ProjectLocation;
  /** False for provider-owned MCP: rows render read-only. */
  editable: boolean;
}): ComposerCustomMcpItem[] {
  const projectIds = new Set(input.projectServers.map((server) => server.id));
  const userSink: McpServersSink = {
    servers: input.userServers,
    ...sharedSettingsServerPersistence(),
  };
  const projectSink: McpServersSink = {
    servers: [...input.projectServers],
    loadServers: () => loadAuthoritativeProjectMcpServers(input.projectId),
    saveServers: (servers) => saveProjectMcpServers(input.projectId, servers),
  };
  return input.servers.map((server) => {
    const isProject = projectIds.has(server.id);
    return {
      id: `${isProject ? "project" : "user"}:${server.id}`,
      name: server.name,
      enabled: server.enabled,
      ...(input.editable
        ? {
            onToggle: (next: boolean) => {
              void commitInOrder(isProject ? `project:${input.projectId}` : "user", () =>
                updateServerRow(isProject ? projectSink : userSink, server.id, (item) => ({
                  ...item,
                  enabled: next,
                })),
              ).catch((error: unknown) => toast.danger(friendlyError(error)));
            },
            oauth: {
              server,
              ...(isProject ? { projectLocation: input.projectLocation } : {}),
            },
          }
        : {}),
    };
  });
}
