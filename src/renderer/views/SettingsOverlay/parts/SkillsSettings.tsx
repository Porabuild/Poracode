import { useLingui } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import { SkillsManager } from "@/renderer/components/skills/SkillsManager";
import { useAppStore } from "@/renderer/state/appStore";
import { SettingsPage } from "./SettingsForm";

export function SkillsSettings() {
  const { t } = useLingui();
  const projects = useAppStore((state) => state.projects)
    .filter((project) => !isHomeProject(project))
    .map(({ id, name, location }) => ({ id, name, location }));

  return (
    <SettingsPage
      title={t`Skills`}
      description={t`Manage shared skills across global and project scopes.`}
      bodyClassName="space-y-5"
    >
      <div data-settings-anchor="skills.manage">
        <SkillsManager projects={projects} />
      </div>
    </SettingsPage>
  );
}
