import { z } from "zod";
import {
  pluginAccountsResultSchema,
  type PluginAccountsPayload,
} from "@/shared/contracts/pluginCatalog";
import type { LoadedPlugin } from "@/shared/contracts/plugin";
import {
  canDisablePlugin,
  installPlugin,
  isPluginSupportedForProject,
  resolveInstalledPluginState,
  setInstalledPluginEnabled,
  setPluginMcpServerEnabled,
  setPluginSkillEnabled,
} from "@/shared/plugins/catalog";
import { pluginNameSchema } from "@/shared/plugins/spec";
import {
  DEFAULT_WAIT_SECONDS,
  ensureFlowWait,
  MAX_WAIT_SECONDS,
  waitForFlow,
} from "./mcpServerOauth";
import {
  pluginDescriptionForScope,
  editInstalledPlugins,
  pluginInventory,
  validatePluginSettingsKey,
} from "./pluginInventory";
import type { AppControlsToolContext, ToolDomain } from "./types";

const listArgs = z.strictObject({
  projectId: z.string().min(1).optional(),
  query: z.string().trim().min(1).max(200).optional(),
});
const configureArgs = z.strictObject({
  pluginName: pluginNameSchema,
  projectId: z.string().min(1).optional(),
  enabled: z.boolean(),
  target: z.enum(["plugin", "skill", "mcp-server"]).default("plugin"),
  contributionId: z.string().min(1).optional(),
});
const accountsArgs = z.strictObject({
  action: z.enum(["list", "begin", "wait", "select", "logout"]),
  pluginName: pluginNameSchema,
  serverName: z.string().min(1).optional(),
  accountId: z.uuid().optional(),
  label: z.string().trim().min(1).max(120).optional(),
  flowId: z.string().min(1).optional(),
  waitSeconds: z.number().int().min(1).max(MAX_WAIT_SECONDS).optional(),
});

function requirePlugin(plugins: LoadedPlugin[], name: string): LoadedPlugin {
  const plugin = plugins.find((candidate) => candidate.name === name);
  if (!plugin)
    throw new Error(`Plugin "${name}" not found. Call list_plugins to see available packages.`);
  return plugin;
}

async function configure(args: z.output<typeof configureArgs>, ctx: AppControlsToolContext) {
  const { pluginName, projectId, target, contributionId, enabled } = args;
  validatePluginSettingsKey(pluginName);
  const { plugins, project } = await pluginInventory(ctx, projectId, projectId === undefined);
  const plugin = requirePlugin(plugins, pluginName);
  if (!enabled && !canDisablePlugin(plugin))
    throw new Error("This bundled plugin and its contributions are always enabled.");
  if (enabled && !isPluginSupportedForProject(plugin, process.platform, project?.location))
    throw new Error("This plugin does not support the selected host or project environment.");
  if (target === "plugin" && contributionId)
    throw new Error("contributionId applies only to a skill or MCP server.");
  if (target === "skill" && !plugin.skills.some(({ folder }) => folder === contributionId))
    throw new Error("Skill not found in this plugin. Use a skill folder from list_plugins.");
  if (target === "mcp-server" && !plugin.mcpServers.some(({ name }) => name === contributionId))
    throw new Error("MCP server not found in this plugin. Use a server name from list_plugins.");
  await editInstalledPlugins(ctx, (current) => {
    if (target === "plugin") {
      return setInstalledPluginEnabled(
        enabled ? installPlugin(current, plugin) : current,
        plugin,
        enabled,
      );
    }
    if (!resolveInstalledPluginState(plugin, current))
      throw new Error("Activate the plugin before configuring its contributions.");
    if (target === "skill") return setPluginSkillEnabled(current, plugin, contributionId!, enabled);
    return setPluginMcpServerEnabled(current, plugin, contributionId!, enabled);
  });
  return {
    plugin: pluginDescriptionForScope(ctx, project)(plugin),
    target,
    ...(contributionId ? { contributionId } : {}),
  };
}

async function pluginAccounts(ctx: AppControlsToolContext, payload: PluginAccountsPayload) {
  const result = pluginAccountsResultSchema.parse(await ctx.supervisor.pluginAccounts(payload));
  if (result.accounts.some(({ pluginName }) => pluginName !== payload.pluginName))
    throw new Error("The supervisor returned a different plugin account inventory.");
  return result;
}

export const pluginTools: ToolDomain = {
  specs: [
    {
      name: "list_plugins",
      description:
        "List Agent Plugin packages already present on this host, including bundled, user and project packages, activation state, platform support, skills and MCP server names. Defaults to the calling thread's project. Pass projectId to inspect a different project, or a query to filter. Use list_plugin_catalogs for packages available from the marketplace.",
      inputSchema: z.toJSONSchema(listArgs, { io: "input" }),
    },
    {
      name: "configure_plugin",
      description:
        "Enable or disable an available plugin, or one of its skills or MCP servers. Use names from list_plugins. Settings are host-wide; projectId only selects which package to resolve. For project-specific enablement use update_project with plugins. For a contribution pass target and contributionId. The user's authorization is required. Changes apply on the next thread launch.",
      inputSchema: z.toJSONSchema(configureArgs, { io: "input" }),
    },
    {
      name: "manage_plugin_accounts",
      description:
        "List, connect, select, or log out of OAuth service accounts for an installed plugin. Use action list for account IDs and list_plugins for server names. For begin supply serverName and a user-assigned label; accountId reconnects an existing account. Give the user the returned authorizationUrl and call wait with flowId. Select and logout require serverName and accountId. Only account metadata is returned.",
      inputSchema: z.toJSONSchema(accountsArgs, { io: "input" }),
    },
  ],
  handlers: {
    list_plugins: async (raw, ctx) => {
      const { projectId, query } = listArgs.parse(raw);
      const { plugins, project } = await pluginInventory(ctx, projectId);
      const search = query?.toLowerCase();
      return {
        ...(project ? { projectId: project.id } : {}),
        plugins: plugins
          .filter(
            (plugin) =>
              !search ||
              [plugin.name, plugin.poracode.title, plugin.manifest.description].some((value) =>
                value?.toLowerCase().includes(search),
              ),
          )
          .map(pluginDescriptionForScope(ctx, project)),
      };
    },
    configure_plugin: (raw, ctx) => configure(configureArgs.parse(raw), ctx),
    manage_plugin_accounts: async (raw, ctx) => {
      const { action, pluginName, serverName, accountId, label, flowId, waitSeconds } =
        accountsArgs.parse(raw);
      if (action === "list") return pluginAccounts(ctx, { action, pluginName });
      if (action === "wait") {
        if (!flowId) throw new Error("Provide the flowId returned by begin.");
        const status = await waitForFlow(
          ctx,
          flowId,
          {},
          waitSeconds ?? DEFAULT_WAIT_SECONDS,
          pluginName,
        );
        return {
          ...status,
          ...(await pluginAccounts(ctx, { action: "list", pluginName })),
        };
      }
      if (!serverName) throw new Error("Provide a serverName from list_plugins.");
      ctx.assertCanPersistSecrets();
      if (action === "begin") {
        if (!label) throw new Error("Provide a user-assigned account label.");
        const result = await pluginAccounts(ctx, {
          action,
          pluginName,
          serverName,
          label,
          ...(accountId ? { accountId } : {}),
        });
        if (result.authorization?.status === "redirect")
          ensureFlowWait(ctx, result.authorization.flowId, {}, pluginName);
        return result;
      }
      if (!accountId)
        throw new Error("Provide an accountId from manage_plugin_accounts with action list.");
      return pluginAccounts(ctx, { action, pluginName, serverName, accountId });
    },
  },
};
