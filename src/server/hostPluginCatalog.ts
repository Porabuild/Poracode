import { isAbsolute } from "node:path";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import type { SharedSettings } from "@/shared/settings";
import { listPluginsResultSchema } from "@/shared/contracts/plugin";
import {
  pluginCatalogResultSchema,
  type PluginCatalogPayload,
  type PluginCatalogResult,
  type PluginCatalogSource,
} from "@/shared/contracts/pluginCatalog";
import {
  hostAdminCatalogResultSchema,
  HOST_ADMIN_CATALOG_FORMAT_VERSION,
  type HostAdminCatalogCommand,
} from "@/shared/contracts/hostPluginCatalog";
import { publicPluginRepository } from "@/shared/plugins/marketplaces";
import { settingsSubjectSchema } from "@/shared/settingsTransactions";
import {
  installPlugin,
  uninstallPlugin,
  setInstalledPluginEnabled,
  resolveInstalledPluginState,
  canDisablePlugin,
  isPluginSupportedOnHost,
} from "@/shared/plugins/catalog";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import type { HeadlessSettingsComposition } from "./headlessSettingsAuthority";

function publicSource(source: PluginCatalogSource): PluginCatalogSource {
  if (source.type === "git") return { ...source, url: publicPluginRepository(source.url) };
  return { type: "local", path: source.path };
}

export async function administerPluginCatalog(
  command: HostAdminCatalogCommand,
  context: HostControlContext,
  options: {
    call: AdminSupervisorCall;
    readSettings(): SharedSettings;
    settings: Pick<HeadlessSettingsComposition, "editSettingsField">;
    assertCanPersistSecrets(): void;
  },
) {
  context.assertActive();
  if (
    "pluginName" in command ||
    command.action === "package-install" ||
    command.action === "package-update"
  )
    settingsSubjectSchema.parse({
      kind: "entry",
      field: "installedPlugins",
      key: "pluginName" in command ? command.pluginName : command.entryName,
    });
  const invoke = async (payload: PluginCatalogPayload) => {
    const result = pluginCatalogResultSchema.parse(await options.call("pluginCatalog", payload));
    context.assertActive();
    return result;
  };
  let result: PluginCatalogResult;
  let enabled: boolean | undefined;
  if (command.action === "plugin-enabled") {
    const inventory = listPluginsResultSchema.parse(await options.call("listPlugins", {}));
    context.assertActive();
    const plugin = inventory.plugins.find((item) => item.name === command.pluginName);
    if (!plugin)
      throw new Error(
        "Plugin not found. Run plugins list; project packages are outside this global command.",
      );
    if (!command.enabled && !canDisablePlugin(plugin))
      throw new Error("This bundled plugin is always enabled and cannot be disabled.");
    if (command.enabled && !isPluginSupportedOnHost(plugin, process.platform))
      throw new Error("This plugin does not support the selected host OS.");
    const saved = await options.settings.editSettingsField("installedPlugins", (current) => {
      context.assertActive();
      return setInstalledPluginEnabled(
        installPlugin(current.installedPlugins, plugin),
        plugin,
        command.enabled,
      );
    });
    if (saved.status !== "committed")
      throw new Error(
        `Plugin enable policy was not committed (${saved.status}); inspect plugins list before retrying.`,
      );
    context.assertActive();
    enabled = resolveInstalledPluginState(plugin, options.readSettings().installedPlugins)?.enabled;
    result = { catalogs: [], installations: [] };
  } else if (command.action === "catalogs-add") {
    const source = publicSource(command.source);
    if (source.type === "local" && !isAbsolute(source.path))
      throw new Error("A local catalog requires an absolute host path.");
    result = await invoke({ action: "add", source });
  } else if (command.action === "catalogs-list" || command.action === "catalogs-inspect") {
    result = await invoke({ action: "list" });
    if (
      command.action === "catalogs-inspect" &&
      !result.catalogs.some((item) => item.id === command.catalogId)
    )
      throw new Error("Catalog not found. Run plugins catalogs list and use its exact ID.");
  } else if (command.action === "catalogs-refresh" || command.action === "catalogs-remove") {
    if (command.action === "catalogs-remove") {
      const current = await invoke({ action: "list" });
      if (!current.catalogs.some((item) => item.id === command.catalogId))
        throw new Error("Catalog not found. Run plugins catalogs list and use its exact ID.");
    }
    result = await invoke({
      action: command.action === "catalogs-refresh" ? "refresh" : "remove-source",
      catalogId: command.catalogId,
    });
  } else if (command.action === "package-remove") {
    options.assertCanPersistSecrets();
    // The supervisor enforces catalog receipt custody and refuses bundled,
    // project, linked, modified and manually placed packages before removal.
    result = await invoke({ action: "remove-package", pluginName: command.pluginName });
    const saved = await options.settings.editSettingsField("installedPlugins", (current) => {
      context.assertActive();
      return uninstallPlugin(current.installedPlugins, command.pluginName);
    });
    if (saved.status !== "committed")
      throw new Error(
        `Package files were removed, but saved enable policy was not cleared (${saved.status}); inspect plugins list before retrying.`,
      );
  } else {
    const target = { catalogId: command.catalogId, entryName: command.entryName };
    result = await invoke({ action: "inspect", ...target });
    const inspection = result.inspection;
    if (!inspection || inspection.plugin.name !== command.entryName)
      throw new Error("The supervisor returned a different package; nothing was installed.");
    if (command.action !== "package-inspect") {
      if (inspection.digest !== command.reviewDigest)
        throw new Error(
          "Package contents changed after review. Inspect the package again; nothing was installed.",
        );
      if (!isPluginSupportedOnHost(inspection.plugin, process.platform))
        throw new Error(
          "This package does not support the selected host OS; nothing was installed.",
        );
      result = await invoke({
        action: command.action === "package-install" ? "install" : "update",
        ...target,
        reviewDigest: command.reviewDigest,
      });
      if (
        !result.inspection ||
        result.inspection.plugin.name !== command.entryName ||
        result.inspection.digest !== command.reviewDigest ||
        !result.installations.some(
          (item) =>
            item.pluginName === command.entryName &&
            item.catalogId === command.catalogId &&
            item.entryName === command.entryName &&
            item.digest === command.reviewDigest,
        )
      )
        throw new Error(
          "The supervisor did not confirm the reviewed package; inspect plugins list before retrying.",
        );
      const installedPlugin = result.inspection.plugin;
      if (command.action === "package-install") {
        const saved = await options.settings.editSettingsField("installedPlugins", (current) => {
          context.assertActive();
          return installPlugin(current.installedPlugins, installedPlugin);
        });
        if (saved.status !== "committed")
          throw new Error(
            `Package files were installed, but activation policy was not saved (${saved.status}); inspect plugins list and use plugins enable or disable explicitly.`,
          );
      }
    }
  }
  context.assertActive();
  const settings = options.readSettings();
  return hostAdminCatalogResultSchema.parse({
    formatVersion: HOST_ADMIN_CATALOG_FORMAT_VERSION,
    scope: "global",
    command,
    catalogs: result.catalogs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      source: publicSource(catalog.source),
      revision: catalog.revision,
      refreshedAt: catalog.refreshedAt,
      entryCount: catalog.entries.length,
      ...(command.action === "catalogs-inspect" && catalog.id === command.catalogId
        ? {
            entries: catalog.entries.map((item) => ({
              name: item.name,
              description: item.description,
              version: item.version ?? null,
              unavailable: item.unavailable,
            })),
          }
        : {}),
    })),
    installations: result.installations.map((item) => ({
      pluginName: item.pluginName,
      catalogId: item.catalogId,
      catalogName: item.catalogName,
      entryName: item.entryName,
      revision: item.revision,
      digest: item.digest,
      installedAt: item.installedAt,
      enabled: settings.installedPlugins[item.pluginName]?.enabled ?? null,
    })),
    ...(result.inspection && "entryName" in command
      ? {
          inspection: {
            catalogId: command.catalogId,
            entryName: command.entryName,
            digest: result.inspection.digest,
            revision: result.inspection.revision,
            name: result.inspection.plugin.name,
            version: result.inspection.plugin.manifest.version ?? null,
            hostSupported: isPluginSupportedOnHost(result.inspection.plugin, process.platform),
            defaultEnabled: result.inspection.plugin.poracode.defaultEnabled,
            skills: result.inspection.plugin.skills.map((skill) => skill.folder),
            mcpServers: result.inspection.plugin.mcpServers.map((server) => ({
              name: server.name,
              transport: server.entry.type,
              environmentNames: server.entry.type === "stdio" ? Object.keys(server.entry.env) : [],
              headerNames: server.entry.type === "stdio" ? [] : Object.keys(server.entry.headers),
            })),
            diagnostics: result.inspection.plugin.diagnostics.map((item) => ({
              severity: item.severity,
              code: item.code,
            })),
          },
        }
      : {}),
    ...(command.action === "plugin-enabled"
      ? { pluginState: { pluginName: command.pluginName, enabled } }
      : {}),
  });
}
