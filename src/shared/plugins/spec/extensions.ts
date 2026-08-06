import { z } from "zod";
import { BUILT_IN_MCP_SERVER_IDS } from "../../contracts/mcpServer";
import { pluginDiagnostic, type PluginDiagnostic } from "./diagnostics";
import type { AgentPluginManifest } from "./manifest";

/**
 * Poracode's client extension namespace.
 *
 * The specification defines exactly two component types — skills and `mcp.json`
 * servers — and reserves `extensions` with reverse-domain keys for everything a
 * client needs beyond that. Poracode's runtime-owned MCP servers (Browser,
 * Chrome, Computer Use, Subagents) mint their URL and bearer token per thread,
 * so they cannot be expressed as static `mcp.json` entries. They are declared
 * here instead, by stable id, and the supervisor wires the live transport.
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

/** A Poracode runtime-owned MCP server surfaced as a plugin contribution. */
export const pluginAppContributionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    builtInMcpServerId: z.enum(BUILT_IN_MCP_SERVER_IDS),
  })
  .strict();
export type PluginAppContribution = z.infer<typeof pluginAppContributionSchema>;

/** Extra policy for a skill discovered at `skills/<folder>/SKILL.md`. */
export const pluginSkillPolicySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    /** Apps that must be active for the skill to be offered or injected. */
    requiredAppIds: z.array(z.string().min(1)).default([]),
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
    apps: z.array(pluginAppContributionSchema).default([]),
    /** Keyed by skill folder name under `skills/`. */
    skills: z.record(z.string().min(1), pluginSkillPolicySchema).default({}),
  })
  .strict();
export type PoracodePluginExtension = z.infer<typeof poracodePluginExtensionSchema>;

export const EMPTY_PORACODE_EXTENSION: PoracodePluginExtension = {
  category: "developer-tools",
  featured: false,
  communityMaintained: false,
  apps: [],
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

  const diagnostics: PluginDiagnostic[] = [];
  const seenAppIds = new Set<string>();
  const apps = parsed.data.apps.filter((app) => {
    if (seenAppIds.has(app.id)) {
      diagnostics.push(
        pluginDiagnostic(
          "warning",
          "plugin",
          "extension-duplicate-app",
          `Ignoring duplicate app '${app.id}'`,
          app.id,
        ),
      );
      return false;
    }
    seenAppIds.add(app.id);
    return true;
  });

  for (const [folder, policy] of Object.entries(parsed.data.skills)) {
    for (const appId of policy.requiredAppIds) {
      if (seenAppIds.has(appId)) continue;
      diagnostics.push(
        pluginDiagnostic(
          "warning",
          "plugin",
          "extension-unknown-required-app",
          `Skill '${folder}' requires app '${appId}', which this plugin does not declare`,
          folder,
        ),
      );
    }
  }

  return { extension: { ...parsed.data, apps }, diagnostics };
}
