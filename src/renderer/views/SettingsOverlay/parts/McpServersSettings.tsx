import { useLingui } from "@lingui/react/macro";
import type { McpServer } from "@/shared/contracts";
import { McpServersManager } from "@/renderer/components/mcp/McpServersManager";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isHomeProject } from "@/shared/homeScope";
import { SettingsPage } from "./SettingsForm";

export function McpServersSettings() {
  const { t } = useLingui();
  const servers = useSharedSettings((state) => state.mcpServers);
  const disabledBuiltIns = useSharedSettings((state) => state.disabledBuiltInMcpServers);
  const setServers = useSharedSettings((state) => state.setMcpServers);
  const setBuiltInDisabled = useSharedSettings((state) => state.setBuiltInMcpServerDisabled);
  const workspaceProject = useAppStore((state) => {
    const projectId = resolveProjectIdForView(state.view, state.threads, state.focusedPaneId);
    const project = state.projects.find((item) => item.id === projectId);
    return isHomeProject(project) ? undefined : project;
  });
  const projects = useAppStore((state) => state.projects);
  const updateProjectMcpServers = useAppStore((state) => state.updateProjectMcpServers);
  const importProjects = projects
    .filter((project) => !isHomeProject(project))
    .map((project) => ({
      id: project.id,
      name: project.name,
      location: project.location,
      servers: project.mcpServers ?? [],
      onChange: (next: McpServer[]) => updateProjectMcpServers(project.id, next),
    }));

  return (
    <SettingsPage
      title={t`MCP Servers`}
      description={t`Manage the MCP server configurations Poracode adds when starting supported agents. Workspace servers can be configured in each project's settings.`}
      bodyClassName="space-y-5"
    >
      <div data-settings-anchor="mcpServers.manage">
        <McpServersManager
          key={workspaceProject?.id ?? "user-only"}
          sources={{
            user: { servers, onChange: setServers },
            ...(workspaceProject
              ? {
                  workspace: {
                    servers: workspaceProject.mcpServers ?? [],
                    projectId: workspaceProject.id,
                    projectLocation: workspaceProject.location,
                    projectName: workspaceProject.name,
                    onChange: (nextServers) =>
                      updateProjectMcpServers(workspaceProject.id, nextServers),
                  },
                }
              : {}),
          }}
          importProjects={importProjects}
          defaultScope="user"
          disabledBuiltIns={disabledBuiltIns}
          onBuiltInDisabledChange={setBuiltInDisabled}
        />
      </div>
    </SettingsPage>
  );
}
