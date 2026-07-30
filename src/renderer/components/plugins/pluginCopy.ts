import { useLingui } from "@lingui/react/macro";
import type { SkillEntry } from "@/shared/contracts";
import { BUILT_IN_PLUGIN_MANIFESTS } from "@/shared/plugins/catalog";

export interface LocalizedPluginContribution {
  id: string;
  name: string;
  description: string;
}

export function useLocalizedPluginCatalog() {
  const { t } = useLingui();

  return BUILT_IN_PLUGIN_MANIFESTS.map((manifest) => {
    let name: string;
    let description: string;
    switch (manifest.id) {
      case "browser-tools":
        name = t`Browser Tools`;
        description = t`Browse, inspect, and test websites in Poracode's isolated in-app browser.`;
        break;
      case "chrome-tools":
        name = t`Chrome Tools`;
        description = t`Work with the pages and signed-in sessions already open in Chrome.`;
        break;
      case "computer-use":
        name = t`Computer Use`;
        description = t`Control desktop apps and complete visual workflows.`;
        break;
      case "subagent-delegation":
        name = t`Subagent Delegation`;
        description = t`Delegate focused work to other installed agents and coordinate the results.`;
        break;
      default:
        name = manifest.name;
        description = manifest.description;
    }

    const skills = manifest.skills.map((skill): LocalizedPluginContribution => {
      switch (skill.id) {
        case "browser-control":
          return {
            id: skill.id,
            name: t`Browser Control`,
            description: t`Navigate, inspect, and test pages with the in-app Browser MCP.`,
          };
        case "chrome-control":
          return {
            id: skill.id,
            name: t`Chrome Control`,
            description: t`Use Chrome safely when a task needs an existing browser session.`,
          };
        case "computer-use":
          return {
            id: skill.id,
            name: t`Computer Use`,
            description: t`Operate desktop apps through Poracode's desktop-control tools.`,
          };
        case "subagent-delegation":
          return {
            id: skill.id,
            name: t`Subagent Delegation`,
            description: t`Choose, brief, and coordinate subagents for parallel work.`,
          };
        default:
          return { id: skill.id, name: skill.name, description: skill.description };
      }
    });

    const apps = manifest.apps.map((app): LocalizedPluginContribution => {
      switch (app.id) {
        case "browser":
          return {
            id: app.id,
            name: t`Browser`,
            description: t`Control Poracode's isolated in-app browser.`,
          };
        case "chrome":
          return {
            id: app.id,
            name: t`Chrome`,
            description: t`Control the user's Chrome browser through Poracode.`,
          };
        case "computer-use":
          return {
            id: app.id,
            name: t`Computer Use`,
            description: t`Control supported desktop apps and windows.`,
          };
        case "subagents":
          return {
            id: app.id,
            name: t`Subagents`,
            description: t`Create and coordinate Poracode agent threads.`,
          };
        default:
          return { id: app.id, name: app.name, description: app.description };
      }
    });

    const category =
      manifest.category === "developer-tools"
        ? t`Developer tools`
        : manifest.category === "automation"
          ? t`Automation`
          : t`Productivity`;

    return { manifest, name, description, category, skills, apps };
  });
}

export type LocalizedPlugin = ReturnType<typeof useLocalizedPluginCatalog>[number];

export function resolveLocalizedPluginSkill(
  catalog: readonly LocalizedPlugin[],
  skill: Pick<SkillEntry, "folderName" | "pluginId">,
) {
  const localizedPlugin = skill.pluginId
    ? catalog.find((plugin) => plugin.manifest.id === skill.pluginId)
    : undefined;
  const pluginSkill = localizedPlugin?.manifest.skills.find(
    (contribution) => contribution.folder === skill.folderName,
  );
  const localizedSkill = localizedPlugin?.skills.find(
    (contribution) => contribution.id === pluginSkill?.id,
  );
  return { localizedPlugin, pluginSkill, localizedSkill };
}
