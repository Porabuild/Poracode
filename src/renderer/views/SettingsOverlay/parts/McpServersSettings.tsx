import { useLingui } from "@lingui/react/macro";
import type { BuiltInMcpServerId, McpServer } from "@/shared/contracts";
import { McpProjectSettingsPicker } from "@/renderer/components/mcp/McpProjectSettingsPicker";
import { McpServersManager } from "@/renderer/components/mcp/McpServersManager";
import { RemoteMcpServersManager } from "@/renderer/components/mcp/RemoteMcpServersManager";
import { sharedSettingsServerPersistence } from "@/renderer/components/mcp/mcpServersMutation";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { openProjectSettings } from "@/renderer/actions/panelActions";
import { saveProjectMcpServers } from "@/renderer/actions/projectActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useReachableProjectFilter } from "@/renderer/state/remoteServers/reachability";
import { loadAuthoritativeProjectMcpServers } from "@/renderer/state/projectSettings/projectSettingsLoader";
import { useResidentProjectMcpServers } from "@/renderer/state/projectSettings/useResidentProjectMcpServers";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { isRemoteSession } from "@/renderer/bridge";
import { isHomeProject } from "@/shared/homeScope";
import { Button } from "@/renderer/components/common/Button";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { CrossagentRoutingSection } from "./CrossagentRoutingSection";

export function McpServersSettings(props: { connectionKey?: string; local?: boolean }) {
  const { t } = useLingui();
  const { connectionKey, local = !isRemoteSession() } = props;
  const projects = useAppStore((state) => state.projects);
  const hostProjects = connectionKey
    ? projects.filter(
        (project) => !isHomeProject(project) && remoteOwner(project)?.desktopId === connectionKey,
      )
    : [];
  return (
    <SettingsPage
      title={t`MCP Servers`}
      description={t`Manage the MCP server configurations Poracode adds when starting supported agents. Workspace servers can be configured in each project's settings.`}
      bodyClassName="space-y-5"
    >
      {connectionKey ? (
        <>
          <ProjectMcpPicker
            projects={hostProjects.map(({ id, name, location, icon }) => ({
              id,
              name,
              location,
              ...(icon ? { icon } : {}),
            }))}
          />
          <div data-settings-anchor="mcpServers.manage">
            <RemoteMcpServersManager connectionKey={connectionKey} projects={hostProjects} />
          </div>
        </>
      ) : local ? (
        <LocalMcpServersSettings />
      ) : (
        <p className="text-sm text-muted" role="status">{t`Offline`}</p>
      )}
    </SettingsPage>
  );
}

function ProjectMcpPicker(props: {
  projects: Parameters<typeof McpProjectSettingsPicker>[0]["projects"];
}) {
  const { t } = useLingui();
  return (
    <SettingRow
      anchorId="mcpServers.projects"
      title={t`Project MCP servers`}
      description={t`Servers in a project's settings apply only to that project and override global servers with the same name. To move a global server, edit it and change its scope.`}
    >
      <McpProjectSettingsPicker
        projects={props.projects}
        onOpen={(projectId) => {
          usePanelStore.getState().closeSettings();
          openProjectSettings(projectId, "mcp");
        }}
      />
    </SettingRow>
  );
}

function LocalMcpServersSettings() {
  const { t } = useLingui();
  const servers = useSharedSettings((state) => state.mcpServers);
  const disabledBuiltIns = useSharedSettings((state) => state.disabledBuiltInMcpServers);
  const disabledBuiltInTools = useSharedSettings((state) => state.disabledBuiltInMcpTools);
  const setBuiltInDisabled = useSharedSettings((state) => state.setBuiltInMcpServerDisabled);
  const setBuiltInToolEnabled = useSharedSettings((state) => state.setBuiltInMcpToolEnabled);
  const workspaceProject = useAppStore((state) => {
    const projectId = resolveProjectIdForView(state.view, state.threads, state.focusedPaneId);
    const project = state.projects.find((item) => item.id === projectId);
    return isHomeProject(project) || remoteOwner(project) ? undefined : project;
  });
  const projects = useAppStore((state) => state.projects);
  // Catalog rows don't carry private MCP settings; open this page's workspace
  // section with them resident instead of reading "not loaded" as empty.
  useResidentProjectMcpServers(workspaceProject);
  const isReachable = useReachableProjectFilter();
  const importProjects = projects
    .filter((project) => !isHomeProject(project) && !remoteOwner(project) && isReachable(project))
    .map((project) => ({
      id: project.id,
      name: project.name,
      location: project.location,
      ...(project.icon ? { icon: project.icon } : {}),
      servers: project.mcpServers ?? [],
      // Import targets commit against the authoritative list, never against a
      // not-yet-loaded projection. `saveServers` gives commit paths (import,
      // move) an awaitable save so a destination refusal can stop before the
      // source copy is deleted.
      loadServers: () => loadAuthoritativeProjectMcpServers(project.id),
      saveServers: (next: McpServer[]) => saveProjectMcpServers(project.id, next),
    }));
  const plugins = useLocalizedPluginCatalog(workspaceProject?.location);
  const managedBuiltIns = plugins.reduce<Partial<Record<BuiltInMcpServerId, string>>>(
    (acc, entry) => {
      for (const id of entry.plugin.poracode.builtInMcpServerIds) {
        acc[id] = entry.name;
      }
      return acc;
    },
    {},
  );

  return (
    <>
      <ProjectMcpPicker projects={importProjects} />
      <div data-settings-anchor="mcpServers.manage">
        <McpServersManager
          key={workspaceProject?.id ?? "user-only"}
          sources={{
            user: {
              servers,
              // The Global list reads and commits against the hydrated
              // shared-settings store with an awaitable bridge flush — never
              // against the render-time projection, and never before the
              // owner settings have hydrated.
              ...sharedSettingsServerPersistence(),
            },
            ...(workspaceProject
              ? {
                  workspace: {
                    servers: workspaceProject.mcpServers ?? [],
                    projectId: workspaceProject.id,
                    projectLocation: workspaceProject.location,
                    projectName: workspaceProject.name,
                    ...(workspaceProject.icon ? { projectIcon: workspaceProject.icon } : {}),
                    loadServers: () => loadAuthoritativeProjectMcpServers(workspaceProject.id),
                    saveServers: (nextServers) =>
                      saveProjectMcpServers(workspaceProject.id, nextServers),
                  },
                }
              : {}),
          }}
          importProjects={importProjects}
          defaultScope="user"
          disabledBuiltIns={disabledBuiltIns}
          disabledBuiltInTools={disabledBuiltInTools}
          onBuiltInDisabledChange={setBuiltInDisabled}
          onBuiltInToolEnabledChange={setBuiltInToolEnabled}
          managedBuiltIns={managedBuiltIns}
          builtInSettings={{
            crossagents: {
              title: t`Crossagents`,
              actionLabel: t`Crossagent routing and ranking`,
              content: (
                <div className="space-y-3">
                  <CrossagentRoutingSection />
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => usePanelStore.getState().openSettingsSection("crews")}
                  >
                    {t`Crews`}
                  </Button>
                </div>
              ),
              dialogClassName: "sm:max-w-2xl",
            },
          }}
        />
      </div>
    </>
  );
}
