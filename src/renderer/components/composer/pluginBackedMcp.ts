import { BUILT_IN_MCP_SERVER_IDS } from "@/shared/contracts";
import type { McpMentionItem, PluginMentionItem } from "./MentionInput";

/**
 * Bridges Poracode's built-in MCP servers and the first-party plugins that
 * package them. Browser, Chrome, Crossagents, Computer Use, and Poracode each
 * exist twice — once as a server the app owns, once as the plugin that wraps
 * it — so every composer surface resolves the pair through this module instead
 * of guessing.
 */

const BUILT_IN_MCP_MENTION_IDS = new Set<string>(BUILT_IN_MCP_SERVER_IDS);

/**
 * Keeps only standalone MCP `@`-mentions.
 *
 * Built-in servers are offered as plugins, so the mention list never shows
 * Browser, Chrome, Crossagents, Computer Use, or Poracode as MCP rows — even
 * when their plugin is off. Plugin-declared `mcp.json` servers (namespaced
 * `plugin:…` or `pluginName.server`) are the same: pick the plugin. Custom
 * user and project servers stay, because they have no plugin row.
 */
export function withoutPluginBackedMcpMentions(
  mcpMentions: readonly McpMentionItem[],
  pluginMentions: readonly PluginMentionItem[],
): McpMentionItem[] {
  const covered = new Set(pluginMentions.flatMap((item) => item.enablesMcpServerIds ?? []));
  const pluginServerPrefixes = pluginMentions.map((item) => `${item.id}.`);
  return mcpMentions.filter((item) => {
    if (BUILT_IN_MCP_MENTION_IDS.has(item.id)) return false;
    if (covered.has(item.id)) return false;
    if (item.id.startsWith("plugin:")) return false;
    return !pluginServerPrefixes.some(
      (prefix) => item.id.startsWith(prefix) || item.name.startsWith(prefix),
    );
  });
}

/**
 * Keeps only the plugin mentions whose built-in servers this composer can
 * actually offer.
 *
 * A plugin row stands in for the MCP rows it wraps, so it must follow the same
 * availability rules: a running thread lists only the servers baked into its
 * launch, and a project that cannot host one (Chrome under WSL) lists neither.
 * Plugins that wrap nothing — those bringing their own server — always stay.
 */
export function pluginMentionsForAvailableMcp(
  pluginMentions: readonly PluginMentionItem[],
  mcpMentions: readonly McpMentionItem[],
): PluginMentionItem[] {
  const available = new Set(mcpMentions.map((item) => item.id));
  return pluginMentions.filter((item) =>
    (item.enablesMcpServerIds ?? []).every((id) => available.has(id)),
  );
}

/**
 * Display name per built-in MCP server id, for the servers an offered plugin
 * wraps. The composer menu and chips use it so a capability reads the same in
 * every surface: `@Browser` in the mention list and "Browser" in the "+" menu.
 * Servers no plugin covers keep their own registry label.
 */
export function pluginLabelsForMcpServers(
  pluginMentions: readonly PluginMentionItem[],
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of pluginMentions) {
    for (const id of item.enablesMcpServerIds ?? []) labels[id] = item.name;
  }
  return labels;
}
