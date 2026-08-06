import { useLingui } from "@lingui/react/macro";
import type { LoadedPlugin, SkillEntry } from "@/shared/contracts";
import { usePlugins } from "@/renderer/state/pluginsStore";

/**
 * Display copy for loaded Agent Plugins packages.
 *
 * Poracode's own packages ship English text in `plugin.json`, so their names and
 * descriptions are overridden here with translated strings. Third-party packages
 * carry author-written metadata that cannot live in our catalogs, so their
 * manifest text is shown as authored — that is the correct behavior for a
 * general plugin client, not a missing translation.
 */

export interface LocalizedPluginContribution {
  id: string;
  name: string;
  /**
   * Absent when we have no copy of our own for this contribution. Callers that
   * have the scanned SKILL.md fall back to its description; an empty string here
   * would shadow it, because `??` does not treat "" as missing.
   */
  description?: string;
}

export interface LocalizedPlugin {
  plugin: LoadedPlugin;
  name: string;
  description: string;
  category: string;
  skills: LocalizedPluginContribution[];
  apps: LocalizedPluginContribution[];
  mcpServers: LocalizedPluginContribution[];
}

export function useLocalizedPluginCatalog(): LocalizedPlugin[] {
  const { t } = useLingui();
  const plugins = usePlugins((state) => state.plugins);

  return plugins.map((plugin): LocalizedPlugin => {
    const fallbackName = plugin.poracode.title ?? plugin.name;
    let name: string;
    let description: string;
    switch (plugin.name) {
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
      case "github":
        name = t`GitHub`;
        description = t`Triage PRs, issues, CI, and publish flows.`;
        break;
      case "outlook":
        name = t`Outlook`;
        description = t`Triage Microsoft Outlook mail and manage your calendar.`;
        break;
      default:
        name = fallbackName;
        description = plugin.manifest.description ?? "";
    }

    const skills = plugin.skills.map((skill): LocalizedPluginContribution => {
      const policy = plugin.poracode.skills[skill.folder];
      switch (skill.folder) {
        case "browser-control":
          return {
            id: skill.folder,
            name: t`Browser Control`,
            description: t`Navigate, inspect, and test pages with the in-app Browser MCP.`,
          };
        case "chrome-control":
          return {
            id: skill.folder,
            name: t`Chrome Control`,
            description: t`Use Chrome safely when a task needs an existing browser session.`,
          };
        case "computer-use":
          return {
            id: skill.folder,
            name: t`Computer Use`,
            description: t`Operate desktop apps through Poracode's desktop-control tools.`,
          };
        case "subagent-delegation":
          return {
            id: skill.folder,
            name: t`Subagent Delegation`,
            description: t`Choose, brief, and coordinate subagents for parallel work.`,
          };
        default:
          return {
            id: skill.folder,
            name: policy?.name ?? skill.folder,
            ...(policy?.description ? { description: policy.description } : {}),
          };
      }
    });

    const apps = plugin.poracode.apps.map((app): LocalizedPluginContribution => {
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

    // Server transport detail is author-supplied and identifies the endpoint, so
    // it is shown verbatim rather than translated.
    const mcpServers = plugin.mcpServers.map((server): LocalizedPluginContribution => {
      const entry = server.entry;
      return {
        id: server.name,
        name: server.name,
        description: entry.type === "stdio" ? entry.command : entry.url,
      };
    });

    const category =
      plugin.poracode.category === "developer-tools"
        ? t`Developer tools`
        : plugin.poracode.category === "automation"
          ? t`Automation`
          : plugin.poracode.category === "communication"
            ? t`Communication`
            : t`Productivity`;

    return { plugin, name, description, category, skills, apps, mcpServers };
  });
}

export function resolveLocalizedPluginSkill(
  catalog: readonly LocalizedPlugin[],
  skill: Pick<SkillEntry, "folderName" | "pluginId">,
) {
  const localizedPlugin = skill.pluginId
    ? catalog.find((entry) => entry.plugin.name === skill.pluginId)
    : undefined;
  const pluginSkill = localizedPlugin?.plugin.skills.find(
    (contribution) => contribution.folder === skill.folderName,
  );
  const localizedSkill = localizedPlugin?.skills.find(
    (contribution) => contribution.id === pluginSkill?.folder,
  );
  return { localizedPlugin, pluginSkill, localizedSkill };
}
