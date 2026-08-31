import type { McpMentionItem, PluginMentionItem } from "./MentionInput";

/**
 * Bridges Poracode's built-in MCP servers and the first-party plugins that
 * package them. Browser, Chrome, Crossagents, and Computer Use each exist twice
 * — once as a server the app owns, once as the plugin that wraps it — so every
 * composer surface resolves the pair through this module instead of guessing.
 */

/**
 * Drops the `@`-mentions for built-in MCP servers an offered plugin already
 * covers.
 *
 * Browser, Chrome, Crossagents, and Computer Use are each packaged as a
 * first-party plugin that binds the same server, so both lists would otherwise
 * offer the same tool twice under near-identical names. The plugin row wins: it
 * carries the skill and enables the server on select. A row stays when no
 * plugin covers its server (custom servers, or a plugin the user disabled) or
 * when it declares `keepAlongsidePlugin` because it means something narrower
 * than the plugin's skill.
 */
export function withoutPluginBackedMcpMentions(
  mcpMentions: readonly McpMentionItem[],
  pluginMentions: readonly PluginMentionItem[],
): McpMentionItem[] {
  const covered = new Set(pluginMentions.flatMap((item) => item.enablesMcpServerIds ?? []));
  if (covered.size === 0) return [...mcpMentions];
  return mcpMentions.filter((item) => item.keepAlongsidePlugin === true || !covered.has(item.id));
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
 * every surface: `@Browser Tools` in the mention list and "Browser Tools" in
 * the "+" menu. Servers no plugin covers keep their own registry label.
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
