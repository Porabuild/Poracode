import { isAbsolute } from "node:path";
import { z } from "zod";
import type { PluginCatalogResult } from "@/shared/contracts/pluginCatalog";
import { installPlugin, isPluginSupportedOnHost, uninstallPlugin } from "@/shared/plugins/catalog";
import { publicPluginRepository } from "@/shared/plugins/marketplaces";
import { pluginNameSchema } from "@/shared/plugins/spec";
import { editInstalledPlugins, pluginContents, validatePluginSettingsKey } from "./pluginInventory";
import type { AppControlsToolContext, ToolDomain } from "./types";

const catalogIdSchema = z.uuid();
const packageKeyFields = { catalogId: catalogIdSchema, entryName: pluginNameSchema };
const browseArgs = z.strictObject({
  catalogId: catalogIdSchema.optional(),
  query: z.string().trim().min(1).max(200).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(40),
});
const manageArgs = z.strictObject({
  action: z.enum(["add", "refresh", "remove"]),
  catalogId: catalogIdSchema.optional(),
  repository: z.string().min(1).max(4096).optional(),
  ref: z.string().min(1).max(1024).optional(),
  localPath: z.string().min(1).max(4096).optional(),
});
const inspectArgs = z.strictObject(packageKeyFields);
const installArgs = z.strictObject({
  ...packageKeyFields,
  action: z.enum(["install", "update"]).default("install"),
  reviewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
});
const removeArgs = z.strictObject({ pluginName: pluginNameSchema });

function catalogSource(source: PluginCatalogResult["catalogs"][number]["source"]) {
  if (source.type === "local") return source;
  try {
    return { ...source, url: publicPluginRepository(source.url) };
  } catch {
    return { type: source.type };
  }
}

function catalogSummary({ catalogs, installations }: PluginCatalogResult) {
  return {
    catalogs: catalogs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      source: catalogSource(catalog.source),
      revision: catalog.revision,
      refreshedAt: catalog.refreshedAt,
      entryCount: catalog.entries.length,
    })),
    installations: installations.map(
      ({ pluginName, catalogId, catalogName, entryName, revision, digest, installedAt }) => ({
        pluginName,
        catalogId,
        catalogName,
        entryName,
        revision,
        digest,
        installedAt,
      }),
    ),
  };
}

function requireInspection(result: PluginCatalogResult, entryName: string) {
  const inspection = result.inspection;
  if (!inspection || inspection.plugin.name !== entryName)
    throw new Error("The supervisor did not return the requested plugin package.");
  return inspection;
}

function inspectionView(inspection: NonNullable<PluginCatalogResult["inspection"]>) {
  return {
    ...pluginContents(inspection.plugin),
    supported: isPluginSupportedOnHost(inspection.plugin, process.platform),
    revision: inspection.revision,
    reviewDigest: inspection.digest,
  };
}

async function browse(args: z.output<typeof browseArgs>, ctx: AppControlsToolContext) {
  const result = await ctx.supervisor.pluginCatalog({ action: "list" });
  const catalogs = result.catalogs.filter(
    (catalog) => !args.catalogId || catalog.id === args.catalogId,
  );
  if (args.catalogId && catalogs.length === 0)
    throw new Error("Catalog not found. Call list_plugin_catalogs for IDs.");
  const query = args.query?.toLowerCase();
  const matches = catalogs.flatMap((catalog) =>
    catalog.entries
      .filter(
        (entry) =>
          !query ||
          [entry.name, entry.description, entry.category].some((value) =>
            value?.toLowerCase().includes(query),
          ),
      )
      .map(({ name, description, version, category, unavailable }) => ({
        catalogId: catalog.id,
        catalogName: catalog.name,
        entryName: name,
        description: description.slice(0, 1000),
        version: version ?? null,
        ...(category ? { category } : {}),
        unavailable,
      })),
  );
  const end = args.offset + args.limit;
  return {
    ...catalogSummary({ ...result, catalogs }),
    entries: matches.slice(args.offset, end),
    total: matches.length,
    nextOffset: end < matches.length ? end : null,
    unrefreshedCatalogIds: catalogs
      .filter((catalog) => catalog.refreshedAt === 0)
      .map(({ id }) => id),
  };
}

export const pluginCatalogTools: ToolDomain = {
  specs: [
    {
      name: "list_plugin_catalogs",
      description:
        "Browse or search Poracode's plugin marketplace across configured catalogs, including recommended sources. Pass query to search package names, descriptions and categories, or catalogId to browse one catalog. Search covers downloaded snapshots. If unrefreshedCatalogIds is nonempty, use manage_plugin_catalog with action refresh for those catalogs before reporting that a package is missing.",
      inputSchema: z.toJSONSchema(browseArgs, { io: "input" }),
    },
    {
      name: "manage_plugin_catalog",
      description:
        "Add, refresh, or remove one plugin marketplace source on this host. For add pass repository (public HTTPS Git URL with optional ref) or localPath (absolute catalog directory). For refresh or remove pass catalogId from list_plugin_catalogs. Removing a source leaves its installed packages in place. Mutations require user authorization.",
      inputSchema: z.toJSONSchema(manageArgs, { io: "input" }),
    },
    {
      name: "inspect_plugin_package",
      description:
        "Inspect one marketplace package by catalogId and entryName. Returns compatibility, contributed skills and MCP server metadata, and the exact reviewDigest needed to install or update. Inspection does not activate or run the package.",
      inputSchema: z.toJSONSchema(inspectArgs, { io: "input" }),
    },
    {
      name: "install_plugin",
      description:
        "Install or update the exact marketplace package previously reviewed using inspect_plugin_package. Pass action update for an installed package. Show the user the package source and its skills and MCP servers before installing or updating, and proceed only with their explicit authorization. New installs use the package's default activation state. Existing threads pick up package changes on the next launch.",
      inputSchema: z.toJSONSchema(installArgs, { io: "input" }),
    },
    {
      name: "remove_plugin_package",
      description:
        "Uninstall a catalog-managed plugin by name, removing its package files, saved activation settings and service accounts. Requires explicit user authorization. Use configure_plugin to disable a plugin and keep its files.",
      inputSchema: z.toJSONSchema(removeArgs, { io: "input" }),
    },
  ],
  handlers: {
    list_plugin_catalogs: (raw, ctx) => browse(browseArgs.parse(raw), ctx),
    manage_plugin_catalog: async (raw, ctx) => {
      const { action, catalogId, repository, ref, localPath } = manageArgs.parse(raw);
      if (action === "add") {
        if (
          catalogId ||
          (repository === undefined) === (localPath === undefined) ||
          (ref && !repository)
        )
          throw new Error(
            "For add, pass exactly one of repository or localPath. ref applies to repository.",
          );
        if (localPath && !isAbsolute(localPath))
          throw new Error("localPath must be absolute on the host.");
        const source = repository
          ? {
              type: "git" as const,
              url: publicPluginRepository(repository),
              ...(ref ? { ref } : {}),
            }
          : { type: "local" as const, path: localPath! };
        return catalogSummary(await ctx.supervisor.pluginCatalog({ action: "add", source }));
      }
      if (!catalogId || repository || localPath || ref)
        throw new Error(
          "For refresh or remove, pass only the catalogId from list_plugin_catalogs.",
        );
      return catalogSummary(
        await ctx.supervisor.pluginCatalog({
          action: action === "refresh" ? "refresh" : "remove-source",
          catalogId,
        }),
      );
    },
    inspect_plugin_package: async (raw, ctx) => {
      const args = inspectArgs.parse(raw);
      const result = await ctx.supervisor.pluginCatalog({ action: "inspect", ...args });
      const catalog = result.catalogs.find(({ id }) => id === args.catalogId);
      return {
        ...args,
        ...(catalog ? { catalogName: catalog.name, source: catalogSource(catalog.source) } : {}),
        package: inspectionView(requireInspection(result, args.entryName)),
      };
    },
    install_plugin: async (raw, ctx) => {
      const { action, reviewDigest, ...target } = installArgs.parse(raw);
      validatePluginSettingsKey(target.entryName);
      const before = await ctx.supervisor.pluginCatalog({ action: "inspect", ...target });
      const reviewed = requireInspection(before, target.entryName);
      if (reviewed.digest !== reviewDigest)
        throw new Error(
          "Package contents changed after review. Call inspect_plugin_package again.",
        );
      if (!isPluginSupportedOnHost(reviewed.plugin, process.platform))
        throw new Error("This plugin package does not support the host OS.");
      const result = await ctx.supervisor.pluginCatalog({ action, ...target, reviewDigest });
      const installed = requireInspection(result, target.entryName);
      const receipt = result.installations.find(
        (item) =>
          item.pluginName === target.entryName &&
          item.entryName === target.entryName &&
          item.catalogId === target.catalogId &&
          item.digest === reviewDigest,
      );
      if (!receipt || installed.digest !== reviewDigest)
        throw new Error(
          "The supervisor did not confirm the reviewed installation. Check list_plugin_catalogs before retrying.",
        );
      try {
        await editInstalledPlugins(ctx, (current) => {
          if (action === "install") return installPlugin(current, installed.plugin);
          const state = current[installed.plugin.name];
          return state
            ? {
                ...current,
                [installed.plugin.name]: {
                  ...state,
                  version: installed.plugin.manifest.version ?? "0.0.0",
                },
              }
            : current;
        });
      } catch (error) {
        ctx.reportError?.(error);
        return {
          action,
          ...target,
          package: inspectionView(installed),
          settingsSaved: false,
          warning:
            "The package was written, but activation settings could not be saved. Check list_plugins and use configure_plugin to set activation if needed.",
        };
      }
      return { action, ...target, package: inspectionView(installed), settingsSaved: true };
    },
    remove_plugin_package: async (raw, ctx) => {
      const { pluginName } = removeArgs.parse(raw);
      validatePluginSettingsKey(pluginName);
      ctx.assertCanPersistSecrets();
      await ctx.supervisor.pluginCatalog({ action: "remove-package", pluginName });
      try {
        await editInstalledPlugins(ctx, (current) => uninstallPlugin(current, pluginName));
      } catch (error) {
        ctx.reportError?.(error);
        return {
          removed: true,
          pluginName,
          settingsSaved: false,
          warning: "The package was removed, but its activation settings could not be cleared.",
        };
      }
      return { removed: true, pluginName, settingsSaved: true };
    },
  },
};
