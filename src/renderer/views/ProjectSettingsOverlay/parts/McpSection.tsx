import { useLingui } from "@lingui/react/macro";
import type { McpServer } from "@/shared/contracts";
import { saveProjectMcpServers } from "@/renderer/actions/projectActions";
import { McpServersManager } from "@/renderer/components/mcp/McpServersManager";
import { sharedSettingsServerPersistence } from "@/renderer/components/mcp/mcpServersMutation";
import { useAppStore } from "@/renderer/state/appStore";
import { loadAuthoritativeProjectMcpServers } from "@/renderer/state/projectSettings/projectSettingsLoader";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isHomeProject } from "@/shared/homeScope";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";

export function McpSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useAppStore((state) =>
    state.projects.find((item) => item.id === props.projectId),
  );
  const projects = useAppStore((state) => state.projects);
  const userServers = useSharedSettings((state) => state.mcpServers);

  if (!project) return null;

  const importProjects = projects
    .filter((item) => item.remoteServerId === project.remoteServerId)
    .filter((item) => !isHomeProject(item))
    .map((item) => ({
      id: item.id,
      name: item.name,
      location: item.location,
      ...(item.icon ? { icon: item.icon } : {}),
      servers: item.mcpServers ?? [],
      // Import targets commit against the authoritative list, never against a
      // not-yet-loaded projection. `saveServers` gives commit paths (import,
      // move) an awaitable save so a destination refusal can stop before the
      // source copy is deleted.
      loadServers: () => loadAuthoritativeProjectMcpServers(item.id),
      saveServers: (servers: McpServer[]) => saveProjectMcpServers(item.id, servers),
    }));

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <SettingsPage
        title={t`MCP Servers`}
        description={t`Workspace MCP servers override user servers with the same name and are added only when agents start in this project.`}
        bodyClassName="space-y-5"
      >
        <McpServersManager
          sources={{
            user: {
              servers: userServers,
              // The Global list reads and commits against the hydrated
              // shared-settings store with an awaitable bridge flush — never
              // against the render-time projection, and never before the
              // owner settings have hydrated.
              ...sharedSettingsServerPersistence(),
            },
            workspace: {
              servers: project.mcpServers ?? [],
              projectId: project.id,
              projectLocation: project.location,
              projectName: project.name,
              ...(project.icon ? { projectIcon: project.icon } : {}),
              loadServers: () => loadAuthoritativeProjectMcpServers(project.id),
              saveServers: (servers) => saveProjectMcpServers(project.id, servers),
            },
          }}
          importProjects={importProjects}
          defaultScope="workspace"
        />
      </SettingsPage>
    </div>
  );
}
