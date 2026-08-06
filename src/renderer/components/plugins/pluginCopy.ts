import { useLingui } from "@lingui/react/macro";
import type { LoadedPlugin, PluginDiagnostic, SkillEntry } from "@/shared/contracts";
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

    return { plugin, name, description, category, skills, mcpServers };
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

/**
 * User-facing text for a loader diagnostic.
 *
 * `PluginDiagnostic.message` is written in the supervisor, which carries no
 * catalogs, so it is English developer prose ("skills/ exists but is not a
 * directory"). The `code` is the stable part — translate that and keep the raw
 * message only as the technical detail for a code we do not recognize.
 */
export function useLocalizedPluginDiagnostic(): (diagnostic: PluginDiagnostic) => string {
  const { t } = useLingui();

  return (diagnostic) => {
    const target = diagnostic.target;
    switch (diagnostic.code) {
      case "root-unresolvable":
        return t`This plugin's folder could not be read.`;
      case "manifest-missing":
        return t`plugin.json is missing.`;
      case "manifest-unreadable":
      case "manifest-not-object":
        return t`plugin.json could not be read as JSON.`;
      case "manifest-invalid":
        return t`plugin.json is not valid for the Agent Plugins specification.`;
      case "manifest-schema-unsupported":
        return t`plugin.json targets an Agent Plugins version this build does not support.`;
      case "manifest-unknown-field":
        return t`Ignored an unrecognized field in plugin.json.`;
      case "manifest-extensions-not-object":
      case "extension-invalid":
        return t`This plugin's Poracode settings were ignored because they are not valid.`;
      case "extension-unknown-skill":
        return t`This plugin describes a skill it does not actually ship.`;
      case "path-escapes-root":
        return target
          ? t`Skipped ${target} because it points outside the plugin folder.`
          : t`Skipped a file because it points outside the plugin folder.`;
      case "skills-location-wrong-kind":
      case "skills-unreadable":
        return t`This plugin's skills could not be read.`;
      case "mcp-location-wrong-kind":
      case "mcp-unreadable":
      case "mcp-document-not-object":
        return t`mcp.json could not be read, so this plugin's servers were skipped.`;
      case "mcp-schema-unsupported":
      case "mcp-schema-version-mismatch":
        return t`mcp.json targets an Agent Plugins version this build does not support.`;
      case "mcp-servers-not-object":
      case "mcp-entry-invalid":
        return target
          ? t`Server ${target} is not configured correctly and was skipped.`
          : t`A server is not configured correctly and was skipped.`;
      case "mcp-entry-unresolvable":
        return target
          ? t`Server ${target} could not be started and was skipped.`
          : t`A server could not be started and was skipped.`;
      case "mcp-entry-host-only":
        return target
          ? t`Server ${target} runs on this computer and is unavailable for WSL projects.`
          : t`This server runs on this computer and is unavailable for WSL projects.`;
      case "mcp-name-unusable":
        return target
          ? t`Server ${target} has a name Poracode cannot use.`
          : t`A server has a name Poracode cannot use.`;
      case "plugin-data-unavailable":
        return t`Poracode could not create this plugin's data folder.`;
      default:
        return diagnostic.message;
    }
  };
}
