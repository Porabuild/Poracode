import { z } from "zod";
import { BUILT_IN_MCP_SERVER_IDS } from "../../contracts/mcpServer";
import { pluginDiagnostic, type PluginDiagnostic } from "./diagnostics";
import type { AgentPluginManifest } from "./manifest";

/**
 * Poracode's client extension namespace.
 *
 * The specification defines exactly two component types — skills and `mcp.json`
 * servers — and reserves `extensions` with reverse-domain keys for anything a
 * client needs on top. Poracode keeps that surface deliberately small: display
 * metadata and host/project support, nothing that duplicates a component type.
 *
 * @see https://agent-plugins.org/specification
 */

export const PORACODE_EXTENSION_NAMESPACE = "com.poracode.client";

export const pluginCategorySchema = z.enum([
  "automation",
  "communication",
  "developer-tools",
  "productivity",
]);
export type PluginCategory = z.infer<typeof pluginCategorySchema>;

export const pluginPlatformSchema = z.enum(["win32", "darwin", "linux"]);
export type PluginPlatform = z.infer<typeof pluginPlatformSchema>;

export const pluginProjectKindSchema = z.enum(["windows", "posix", "wsl"]);
export type PluginProjectKind = z.infer<typeof pluginProjectKindSchema>;

/** Display copy for a skill discovered at `skills/<folder>/SKILL.md`. */
export const pluginSkillPolicySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    /** Provider-native package that owns this skill when it is enabled. */
    nativePluginName: z.string().min(1).optional(),
    /** Skill folder in the provider-native replacement package. */
    nativeSkill: z.string().min(1).optional(),
  })
  .strict();
export type PluginSkillPolicyEntry = z.infer<typeof pluginSkillPolicySchema>;

export const poracodePluginExtensionSchema = z
  .object({
    /** Display title. The spec's `name` is an identifier, not a label. */
    title: z.string().min(1).optional(),
    category: pluginCategorySchema.default("developer-tools"),
    featured: z.boolean().default(false),
    /** Starter prompt offered on the plugin's detail page. */
    examplePrompt: z.string().min(1).optional(),
    /**
     * Set when the MCP server this package launches is maintained by a third
     * party rather than the vendor it integrates with. Surfaced in the UI so the
     * user knows whose code is about to run.
     */
    communityMaintained: z.boolean().default(false),
    platforms: z.array(pluginPlatformSchema).optional(),
    projectKinds: z.array(pluginProjectKindSchema).optional(),
    /** Skill invoked when the package itself is mentioned in chat. */
    coreSkill: z.string().min(1).optional(),
    /** Provider-native packages that collectively replace this package when all are available. */
    nativePluginNames: z.array(z.string().min(1)).default([]),
    /** Core skill folder inside the provider-native replacement package. */
    nativeCoreSkill: z.string().min(1).optional(),
    /** Poracode-owned MCP servers supplied as part of this plugin bundle. */
    builtInMcpServerIds: z.array(z.enum(BUILT_IN_MCP_SERVER_IDS)).default([]),
    /** Keyed by skill folder name under `skills/`. */
    skills: z.record(z.string().min(1), pluginSkillPolicySchema).default({}),
  })
  .strict();
export type PoracodePluginExtension = z.infer<typeof poracodePluginExtensionSchema>;

export const EMPTY_PORACODE_EXTENSION: PoracodePluginExtension = {
  category: "developer-tools",
  featured: false,
  communityMaintained: false,
  nativePluginNames: [],
  builtInMcpServerIds: [],
  skills: {},
};

export interface ParsedPoracodeExtension {
  extension: PoracodePluginExtension;
  diagnostics: PluginDiagnostic[];
}

/**
 * Reads Poracode's namespace out of a validated manifest.
 *
 * A malformed block degrades to "no Poracode extras" with a warning; it never
 * rejects the plugin, because the spec-defined components are still valid.
 */
export function parsePoracodeExtension(manifest: AgentPluginManifest): ParsedPoracodeExtension {
  const raw = manifest.extensions?.[PORACODE_EXTENSION_NAMESPACE];
  if (raw === undefined) return { extension: EMPTY_PORACODE_EXTENSION, diagnostics: [] };

  const parsed = poracodePluginExtensionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      extension: EMPTY_PORACODE_EXTENSION,
      diagnostics: [
        pluginDiagnostic(
          "warning",
          "plugin",
          "extension-invalid",
          `Ignoring '${PORACODE_EXTENSION_NAMESPACE}' extension: ${parsed.error.issues[0]?.message ?? "invalid"}`,
          PORACODE_EXTENSION_NAMESPACE,
        ),
      ],
    };
  }

  return { extension: parsed.data, diagnostics: [] };
}
