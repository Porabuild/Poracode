import { useLingui } from "@lingui/react/macro";
import type { McpServer } from "@/shared/contracts";
import { McpServersManager } from "@/renderer/components/mcp/McpServersManager";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isHomeProject } from "@/shared/homeScope";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";

export function McpSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useAppStore((state) =>
    state.projects.find((item) => item.id === props.projectId),
  );
  const projects = useAppStore((state) => state.projects);
  const updateProjectMcpServers = useAppStore((state) => state.updateProjectMcpServers);
  const userServers = useSharedSettings((state) => state.mcpServers);
  const setUserServers = useSharedSettings((state) => state.setMcpServers);

  if (!project) return null;

  const importProjects = projects
    .filter((item) => !isHomeProject(item))
    .map((item) => ({
      id: item.id,
      name: item.name,
      location: item.location,
      servers: item.mcpServers ?? [],
      onChange: (servers: McpServer[]) => updateProjectMcpServers(item.id, servers),
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
            user: { servers: userServers, onChange: setUserServers },
            workspace: {
              servers: project.mcpServers ?? [],
              projectId: project.id,
              projectLocation: project.location,
              projectName: project.name,
              onChange: (servers) => updateProjectMcpServers(project.id, servers),
            },
          }}
          importProjects={importProjects}
          defaultScope="workspace"
        />
      </SettingsPage>
    </div>
  );
}
