import { useLingui } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import { SkillsManager } from "@/renderer/components/skills/SkillsManager";
import { mcpProjectDestinationId } from "@/renderer/components/mcp/McpProjectDestinationDropdown";
import { useAppStore } from "@/renderer/state/appStore";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";

export function SkillsSection(props: { projectId: string }) {
  const { t } = useLingui();
  const allProjects = useAppStore((state) => state.projects);
  const currentProject = allProjects.find((project) => project.id === props.projectId);
  const projects = allProjects
    .filter((project) => project.remoteServerId === currentProject?.remoteServerId)
    .filter((item) => !isHomeProject(item))
    .map(({ id, name, location, icon }) => ({ id, name, location, ...(icon ? { icon } : {}) }));
  if (!projects.some((project) => project.id === props.projectId)) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <SettingsPage
        title={t`Skills`}
        description={t`Project skills are available only when agents run in this project. Each provider applies its own precedence rules when names overlap.`}
        bodyClassName="space-y-5"
      >
        <SkillsManager
          projects={projects}
          defaultDestinationId={mcpProjectDestinationId(props.projectId)}
        />
      </SettingsPage>
    </div>
  );
}
