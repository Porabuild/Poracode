import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { LoadedPlugin, PluginSkillRef, PluginSource } from "@/shared/contracts";
import {
  agentPluginsSchemaVersion,
  parsePluginManifest,
  parsePluginMcpConfig,
  parsePoracodeExtension,
  pluginDiagnostic,
  type PluginDiagnostic,
} from "@/shared/plugins/spec";
import { relativePolicyPath, resolvePackageBoundary } from "./pathContainment";

/**
 * Loads an Agent Plugins 1.0.0 package from a directory.
 *
 * Component discovery is limited to the two fixed locations the specification
 * defines — `skills/` and `mcp.json` — and every failure is contained at the
 * narrowest applicable boundary:
 *
 *   1. `plugin.json` invalid or escaping the root  → reject the plugin
 *   2. component location wrong kind or escaping   → disable that component type
 *   3. a skill directory escaping or malformed     → skip that skill
 *   4. an `mcp.json` entry invalid                 → skip that entry
 *
 * @see https://agent-plugins.org/client-implementers/loading-and-discovery
 */

export const PLUGIN_MANIFEST_FILE = "plugin.json";
export const PLUGIN_MCP_FILE = "mcp.json";
export const PLUGIN_SKILLS_DIR = "skills";
const SKILL_FILE = "SKILL.md";

export interface PluginLoadResult {
  /** Absent when the plugin was rejected at the plugin-level boundary. */
  plugin?: LoadedPlugin;
  diagnostics: PluginDiagnostic[];
}

type FileKind = "file" | "directory" | "other" | "missing";

function fileKind(path: string): FileKind {
  try {
    const stats = statSync(path);
    if (stats.isFile()) return "file";
    if (stats.isDirectory()) return "directory";
    return "other";
  } catch {
    return "missing";
  }
}

function readJsonFile(path: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadPluginFromDirectory(directory: string, source: PluginSource): PluginLoadResult {
  const diagnostics: PluginDiagnostic[] = [];

  const root = resolvePackageBoundary(directory);
  if (!root) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "root-unresolvable",
        `Cannot resolve plugin directory '${directory}'`,
        directory,
      ),
    );
    return { diagnostics };
  }

  const manifestPath = join(root, PLUGIN_MANIFEST_FILE);
  if (fileKind(manifestPath) !== "file") {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "manifest-missing",
        `No readable ${PLUGIN_MANIFEST_FILE} in '${root}'`,
        manifestPath,
      ),
    );
    return { diagnostics };
  }
  if (relativePolicyPath(root, manifestPath) === undefined) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "path-escapes-root",
        `${PLUGIN_MANIFEST_FILE} resolves outside the package boundary`,
        manifestPath,
      ),
    );
    return { diagnostics };
  }

  const manifestJson = readJsonFile(manifestPath);
  if (manifestJson.error !== undefined) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "plugin",
        "manifest-unreadable",
        `Cannot read ${PLUGIN_MANIFEST_FILE}: ${manifestJson.error}`,
        manifestPath,
      ),
    );
    return { diagnostics };
  }

  const parsedManifest = parsePluginManifest(manifestJson.value);
  diagnostics.push(...parsedManifest.diagnostics);
  const manifest = parsedManifest.manifest;
  if (!manifest) return { diagnostics };

  const extension = parsePoracodeExtension(manifest);
  diagnostics.push(...extension.diagnostics);

  const skills = discoverSkills(root, diagnostics);
  const mcpServers = discoverMcpServers(root, manifest.$schema, diagnostics);

  const declaredSkillFolders = new Set(Object.keys(extension.extension.skills));
  if (extension.extension.coreSkill) declaredSkillFolders.add(extension.extension.coreSkill);
  for (const folder of declaredSkillFolders) {
    if (skills.some((skill) => skill.folder === folder)) continue;
    diagnostics.push(
      pluginDiagnostic(
        "warning",
        "plugin",
        "extension-unknown-skill",
        `Extension declares policy for skill '${folder}', which was not discovered under ${PLUGIN_SKILLS_DIR}/`,
        folder,
      ),
    );
  }

  return {
    plugin: {
      name: manifest.name,
      source,
      root,
      manifest,
      poracode: extension.extension,
      skills,
      mcpServers,
      diagnostics,
    },
    diagnostics,
  };
}

/** Immediate child directories of `skills/` that contain a `SKILL.md`. No recursion. */
function discoverSkills(root: string, diagnostics: PluginDiagnostic[]): PluginSkillRef[] {
  const skillsDir = join(root, PLUGIN_SKILLS_DIR);
  const kind = fileKind(skillsDir);
  if (kind === "missing") return [];
  if (kind !== "directory") {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "skills-location-wrong-kind",
        `${PLUGIN_SKILLS_DIR} exists but is not a directory; skills are disabled for this plugin`,
        skillsDir,
      ),
    );
    return [];
  }
  if (relativePolicyPath(root, skillsDir) === undefined) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "path-escapes-root",
        `${PLUGIN_SKILLS_DIR} resolves outside the package boundary; skills are disabled for this plugin`,
        skillsDir,
      ),
    );
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch (error) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "skills-unreadable",
        `Cannot read ${PLUGIN_SKILLS_DIR}: ${error instanceof Error ? error.message : String(error)}`,
        skillsDir,
      ),
    );
    return [];
  }

  const skills: PluginSkillRef[] = [];
  for (const entry of entries.sort()) {
    const skillDir = join(skillsDir, entry);
    if (fileKind(skillDir) !== "directory") continue;
    const skillFile = join(skillDir, SKILL_FILE);
    if (fileKind(skillFile) !== "file") continue;
    if (
      relativePolicyPath(root, skillDir) === undefined ||
      relativePolicyPath(root, skillFile) === undefined
    ) {
      diagnostics.push(
        pluginDiagnostic(
          "error",
          "skill",
          "path-escapes-root",
          `Skipping skill '${entry}' because it resolves outside the package boundary`,
          entry,
        ),
      );
      continue;
    }
    skills.push({ folder: basename(skillDir), path: skillDir });
  }
  return skills;
}

function discoverMcpServers(
  root: string,
  manifestSchemaUrl: string,
  diagnostics: PluginDiagnostic[],
): LoadedPlugin["mcpServers"] {
  const mcpPath = join(root, PLUGIN_MCP_FILE);
  const kind = fileKind(mcpPath);
  if (kind === "missing") return [];
  if (kind !== "file") {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-location-wrong-kind",
        `${PLUGIN_MCP_FILE} exists but is not a file; MCP servers are disabled for this plugin`,
        mcpPath,
      ),
    );
    return [];
  }
  if (relativePolicyPath(root, mcpPath) === undefined) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "path-escapes-root",
        `${PLUGIN_MCP_FILE} resolves outside the package boundary; MCP servers are disabled for this plugin`,
        mcpPath,
      ),
    );
    return [];
  }

  const document = readJsonFile(mcpPath);
  if (document.error !== undefined) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-unreadable",
        `Cannot read ${PLUGIN_MCP_FILE}: ${document.error}`,
        mcpPath,
      ),
    );
    return [];
  }

  const parsed = parsePluginMcpConfig(
    document.value,
    agentPluginsSchemaVersion(manifestSchemaUrl) ?? "",
  );
  diagnostics.push(...parsed.diagnostics);
  return parsed.servers;
}
