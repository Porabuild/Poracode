import { useAppStore } from "@/renderer/state/appStore";
import { useProject } from "@/renderer/state/useThread";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { McpManager } from "@/renderer/components/mcp/McpManager";

export function McpSection(props: { projectId: string }) {
  const project = useProject(props.projectId);
  const updateProjectMcpServers = useAppStore((s) => s.updateProjectMcpServers);
  const globalCount = useSharedSettings((s) => s.mcpServers.length);

  if (!project) return null;

  const projectPath =
    project.location.kind === "wsl" ? project.location.uncPath : project.location.path;
  const servers = project.mcpServers ?? [];

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-2 text-lg font-semibold text-foreground">MCP Servers</h1>
        <p className="mb-6 text-xs text-muted">
          Project-scoped MCP servers, merged on top of your global servers for this project. A
          project server with the same name overrides the global one.
        </p>
        <McpManager
          servers={servers}
          onChange={(next) => updateProjectMcpServers(project.id, next)}
          projectPath={projectPath}
          banner={
            globalCount > 0 ? (
              <p className="rounded-md bg-surface-tertiary px-3 py-2 text-[11px] text-muted">
                {globalCount} global server{globalCount === 1 ? "" : "s"} also apply to this project
                (manage them in Settings → MCP Servers).
              </p>
            ) : null
          }
        />
      </div>
    </div>
  );
}
