import { z } from "zod";
import {
  agentPluginManifestSchema,
  pluginMcpEntrySchema,
  poracodePluginExtensionSchema,
} from "../plugins/spec";

/**
 * Contracts for Agent Plugins packages after loading.
 *
 * The manifest itself is defined by the specification (`src/shared/plugins/spec`).
 * This module covers what Poracode adds on top: where a package was found, what
 * the loader resolved out of it, and the per-plugin state the user controls.
 */

export const pluginSourceSchema = z.enum(["bundled", "user"]);
export type PluginSource = z.infer<typeof pluginSourceSchema>;

export const pluginDiagnosticSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    scope: z.enum(["plugin", "component-type", "skill", "mcp-server"]),
    code: z.string().min(1),
    message: z.string().min(1),
    target: z.string().min(1).optional(),
  })
  .strict();

/** A `skills/<folder>/SKILL.md` discovered inside the package boundary. */
export const pluginSkillRefSchema = z
  .object({
    folder: z.string().min(1),
    /** Absolute host path to the skill directory. */
    path: z.string().min(1),
  })
  .strict();
export type PluginSkillRef = z.infer<typeof pluginSkillRefSchema>;

export const pluginMcpServerRefSchema = z
  .object({
    /** Key as authored in `mcp.json`. */
    name: z.string().min(1),
    entry: pluginMcpEntrySchema,
  })
  .strict();
export type PluginMcpServerRef = z.infer<typeof pluginMcpServerRefSchema>;

/** A package that passed the loader's plugin-level checks. */
export const loadedPluginSchema = z
  .object({
    name: z.string().min(1),
    source: pluginSourceSchema,
    /** Filesystem-resolved package boundary. */
    root: z.string().min(1),
    manifest: agentPluginManifestSchema,
    poracode: poracodePluginExtensionSchema,
    skills: z.array(pluginSkillRefSchema),
    mcpServers: z.array(pluginMcpServerRefSchema),
    diagnostics: z.array(pluginDiagnosticSchema),
  })
  .strict();
export type LoadedPlugin = z.infer<typeof loadedPluginSchema>;

export const listPluginsResultSchema = z
  .object({
    plugins: z.array(loadedPluginSchema),
    /** Absolute path of the user plugin directory, for "open folder". */
    userPluginsDir: z.string().min(1),
  })
  .strict();
export type ListPluginsResult = z.infer<typeof listPluginsResultSchema>;

/**
 * Per-plugin user state, keyed by the manifest `name`. Contribution ids are the
 * skill folder name and the `mcp.json` server key.
 */
export const installedPluginStateSchema = z
  .object({
    version: z.string().min(1).default("0.0.0"),
    enabled: z.boolean().default(true),
    disabledSkillIds: z.array(z.string().min(1)).default([]),
    disabledMcpServerNames: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type InstalledPluginState = z.infer<typeof installedPluginStateSchema>;

export const installedPluginsSchema = z.record(z.string(), installedPluginStateSchema).default({});
export type InstalledPlugins = z.infer<typeof installedPluginsSchema>;

export type { PluginCategory, PluginPlatform, PluginProjectKind } from "../plugins/spec";
