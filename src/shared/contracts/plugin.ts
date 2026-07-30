import { z } from "zod";
import { BUILT_IN_MCP_SERVER_IDS } from "./mcpServer";

export const pluginCategorySchema = z.enum(["automation", "developer-tools", "productivity"]);
export type PluginCategory = z.infer<typeof pluginCategorySchema>;
export const pluginPlatformSchema = z.enum(["win32", "darwin", "linux"]);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;
export const pluginProjectKindSchema = z.enum(["windows", "posix", "wsl"]);
export type PluginProjectKind = z.infer<typeof pluginProjectKindSchema>;

export const pluginSkillContributionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    folder: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    requiredAppIds: z.array(z.string().min(1)).default([]),
    defaultEnabled: z.literal(true).default(true),
  })
  .strict();
export type PluginSkillContribution = z.infer<typeof pluginSkillContributionSchema>;

export const pluginAppContributionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    builtInMcpServerId: z.enum(BUILT_IN_MCP_SERVER_IDS),
    defaultEnabled: z.literal(true).default(true),
  })
  .strict();
export type PluginAppContribution = z.infer<typeof pluginAppContributionSchema>;

/** Provider-neutral Poracode plugin manifest. Runtime-owned apps are referenced by stable id. */
export const pluginManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    publisher: z.string().min(1),
    category: pluginCategorySchema,
    platforms: z.array(pluginPlatformSchema).optional(),
    projectKinds: z.array(pluginProjectKindSchema).optional(),
    featured: z.boolean().default(false),
    skills: z.array(pluginSkillContributionSchema),
    apps: z.array(pluginAppContributionSchema),
  })
  .strict();
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export const installedPluginStateSchema = z
  .object({
    version: z.string().min(1),
    enabled: z.boolean().default(true),
    disabledSkillIds: z.array(z.string().min(1)).default([]),
    disabledAppIds: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type InstalledPluginState = z.infer<typeof installedPluginStateSchema>;

export const installedPluginsSchema = z.record(z.string(), installedPluginStateSchema).default({});
export type InstalledPlugins = z.infer<typeof installedPluginsSchema>;
