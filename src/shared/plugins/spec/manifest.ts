import { z } from "zod";
import { pluginDiagnostic, type PluginDiagnostic } from "./diagnostics";

/**
 * Agent Plugins Specification 1.0.0 — root `plugin.json` manifest.
 *
 * @see https://agent-plugins.org/specification
 */

export const AGENT_PLUGINS_VERSION = "1.0.0";
export const AGENT_PLUGINS_SCHEMA_BASE = "https://agent-plugins.org/schemas";
export const AGENT_PLUGINS_MANIFEST_SCHEMA_URL = `${AGENT_PLUGINS_SCHEMA_BASE}/${AGENT_PLUGINS_VERSION}/plugin.schema.json`;

/**
 * Schema identifiers this build understands. Selection is local by design — the
 * spec forbids retrieving a schema while loading a plugin.
 */
const SUPPORTED_MANIFEST_SCHEMA_URLS = new Set([AGENT_PLUGINS_MANIFEST_SCHEMA_URL]);

/**
 * Returns the Agent Plugins version encoded in a published schema identifier, so
 * `plugin.json` and `mcp.json` can be checked for a matching version.
 */
export function agentPluginsSchemaVersion(schemaUrl: string): string | undefined {
  const match = new RegExp(
    `^${AGENT_PLUGINS_SCHEMA_BASE}/([^/]+)/(?:plugin|mcp)\\.schema\\.json$`,
    "u",
  ).exec(schemaUrl.trim());
  return match?.[1];
}

/**
 * Plugin name: 1–64 chars of `a-z0-9-.`, alphanumeric at both ends, and no `--`
 * or `..` runs.
 */
const PLUGIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;

export function isValidPluginName(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 64 &&
    PLUGIN_NAME_PATTERN.test(value) &&
    !value.includes("--") &&
    !value.includes("..")
  );
}

export const pluginNameSchema = z.string().refine(isValidPluginName, {
  message:
    "Plugin name must be 1-64 characters of a-z, 0-9, '-' or '.', start and end alphanumeric, with no '--' or '..' runs",
});

export const pluginAuthorSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
  })
  .strict();
export type PluginAuthor = z.infer<typeof pluginAuthorSchema>;

/**
 * Client-specific data lives under reverse-domain namespace keys. Values are
 * opaque here; each client parses only its own namespace.
 */
export const pluginExtensionsSchema = z.record(z.string().min(1), z.unknown());
export type PluginExtensions = z.infer<typeof pluginExtensionsSchema>;

export const agentPluginManifestSchema = z
  .object({
    $schema: z.string().min(1),
    name: pluginNameSchema,
    version: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    author: pluginAuthorSchema.optional(),
    homepage: z.string().min(1).optional(),
    repository: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    keywords: z.array(z.string().min(1)).optional(),
    extensions: pluginExtensionsSchema.optional(),
  })
  .strict();
export type AgentPluginManifest = z.infer<typeof agentPluginManifestSchema>;

const KNOWN_MANIFEST_KEYS = new Set<string>([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

export interface ParsedPluginManifest {
  manifest?: AgentPluginManifest;
  diagnostics: PluginDiagnostic[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a `plugin.json` document against the closed 1.0.0 schema.
 *
 * Two of the spec's rules are non-fatal and cannot be expressed by a plain
 * strict parse, so they are handled before validation: unknown top-level fields
 * are reported and ignored, and a non-object `extensions` is reported and
 * ignored. Every other schema violation rejects the plugin.
 */
export function parsePluginManifest(value: unknown): ParsedPluginManifest {
  const diagnostics: PluginDiagnostic[] = [];

  if (!isPlainObject(value)) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "manifest-not-object",
        "plugin.json is not a JSON object",
      ),
    );
    return { diagnostics };
  }

  const candidate: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) {
      diagnostics.push(
        pluginDiagnostic(
          "warning",
          "plugin",
          "manifest-unknown-field",
          `Ignoring unknown top-level field '${key}'`,
          key,
        ),
      );
      continue;
    }
    if (key === "extensions" && !isPlainObject(entry)) {
      diagnostics.push(
        pluginDiagnostic(
          "warning",
          "plugin",
          "manifest-extensions-not-object",
          "Ignoring 'extensions' because it is not a JSON object",
          key,
        ),
      );
      continue;
    }
    candidate[key] = entry;
  }

  const parsed = agentPluginManifestSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push(
        pluginDiagnostic(
          "error",
          "plugin",
          "manifest-invalid",
          issue.message,
          issue.path.join(".") || undefined,
        ),
      );
    }
    return { diagnostics };
  }

  const schemaUrl = parsed.data.$schema.trim();
  if (!SUPPORTED_MANIFEST_SCHEMA_URLS.has(schemaUrl)) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "manifest-schema-unsupported",
        `Unsupported $schema '${schemaUrl}'; this build understands ${AGENT_PLUGINS_MANIFEST_SCHEMA_URL}`,
        "$schema",
      ),
    );
    return { diagnostics };
  }

  return { manifest: parsed.data, diagnostics };
}
