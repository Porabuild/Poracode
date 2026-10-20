import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "@/shared/plugins/marketplaces";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  pluginDiagnostic,
  pluginMcpEntrySchema,
  type AgentPluginManifest,
  type PluginDiagnostic,
  type PluginMcpEntry,
} from "@/shared/plugins/spec";
import { relativePolicyPath } from "./pathContainment";

/** Adapter v1 imports skills/MCP only. Upstream packages remain unchanged on disk. */
export const PLUGIN_PACKAGE_ADAPTER_VERSION = 1;
export const PLUGIN_MANIFEST_PATHS = [
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".zcode-plugin/plugin.json",
  ".agent-plugin/plugin.json",
];

export function findPluginManifest(root: string): string | undefined {
  return PLUGIN_MANIFEST_PATHS.find((path) => existsSync(join(root, path)));
}

function readContainedJson(root: string, path: string): unknown {
  const file = join(root, path);
  if (relativePolicyPath(root, file) === undefined)
    throw new Error(`Package path '${path}' escapes its root.`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

export interface CompatiblePackage {
  manifest: AgentPluginManifest;
  skills: string[];
  mcpServers: { name: string; entry: PluginMcpEntry }[];
  mcpFiles: string[];
  diagnostics: PluginDiagnostic[];
}

export function adaptPluginPackage(root: string, raw: unknown): CompatiblePackage {
  if (!isRecord(raw)) throw new Error("Invalid plugin manifest.");
  const diagnostics: PluginDiagnostic[] = [];
  const unsupported = (target: string) =>
    diagnostics.push(
      pluginDiagnostic(
        "warning",
        "component-type",
        "package-capability-unsupported",
        `Poracode does not import '${target}'.`,
        target,
      ),
    );
  const manifest: Record<string, unknown> = { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL };
  for (const key of [
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
  ]) {
    if (raw[key] !== undefined) manifest[key] = raw[key];
  }
  const display = isRecord(raw.interface) ? raw.interface : {};
  const title = typeof raw.displayName === "string" ? raw.displayName : display.displayName;
  // Foreign package policy must never grant Poracode's built-in/native capabilities.
  manifest.extensions = {
    "com.poracode.client": {
      defaultEnabled: false,
      ...(typeof title === "string" ? { title } : {}),
    },
  };
  for (const [field, defaultPath] of Object.entries({
    commands: "commands",
    agents: "agents",
    hooks: "hooks",
    rules: "rules",
    apps: ".app.json",
    lspServers: ".lsp.json",
  })) {
    if (raw[field] !== undefined || existsSync(join(root, defaultPath))) unsupported(field);
  }
  for (const field of [
    "ui",
    "userConfig",
    "variables",
    "settings",
    "channels",
    "outputStyles",
    "experimental",
  ]) {
    if (raw[field] !== undefined) unsupported(field);
  }
  if (raw.dependencies && (!Array.isArray(raw.dependencies) || raw.dependencies.length > 0))
    unsupported("dependencies");
  const skills = ["skills"];
  if (typeof raw.skills === "string") skills.push(raw.skills);
  else if (Array.isArray(raw.skills) && raw.skills.every((entry) => typeof entry === "string"))
    skills.push(...(raw.skills as string[]));
  else if (raw.skills !== undefined) unsupported("skills");

  const mcpServers: CompatiblePackage["mcpServers"] = [];
  const locations = [".mcp.json", "mcp.json"];
  if (typeof raw.mcpServers === "string") locations.push(raw.mcpServers);
  else if (
    Array.isArray(raw.mcpServers) &&
    raw.mcpServers.every((entry) => typeof entry === "string")
  )
    locations.push(...(raw.mcpServers as string[]));
  const documents: unknown[] = [];
  for (const path of new Set(locations)) {
    if (!existsSync(join(root, path))) continue;
    try {
      documents.push(readContainedJson(root, path));
    } catch {
      diagnostics.push(
        pluginDiagnostic(
          "error",
          "component-type",
          "mcp-unreadable",
          "Cannot read package MCP definitions.",
          path,
        ),
      );
    }
  }
  if (isRecord(raw.mcpServers)) documents.push(raw.mcpServers);
  const seen = new Set<string>();
  for (const document of documents) {
    const servers =
      isRecord(document) && isRecord(document.mcpServers) ? document.mcpServers : document;
    if (!isRecord(servers)) {
      unsupported("mcpServers");
      continue;
    }
    for (const [name, value] of Object.entries(servers)) {
      if (name === "$schema") continue;
      if (seen.has(name)) {
        unsupported(`mcp:${name}`);
        continue;
      }
      seen.add(name);
      if (!isRecord(value)) {
        unsupported(`mcp:${name}`);
        continue;
      }
      const entry = { ...value };
      if (entry.type === "http") entry.type = "streamable-http";
      if (!entry.type && typeof entry.command === "string") entry.type = "stdio";
      if (entry.oauth_resource === entry.url) delete entry.oauth_resource;
      // These declarations change authentication semantics; never silently drop them.
      const serialized = JSON.stringify(entry).replace(
        /\$\{(?:CLAUDE|CODEX|CURSOR|ZCODE)_PLUGIN_(ROOT|DATA)\}/gu,
        "${PLUGIN_$1}",
      );
      if (/\$\{(?!PLUGIN_(?:ROOT|DATA)\})/u.test(serialized)) {
        unsupported(`mcp:${name}`);
        continue;
      }
      const parsed = pluginMcpEntrySchema.safeParse(JSON.parse(serialized));
      if (!parsed.success) {
        diagnostics.push(
          pluginDiagnostic(
            "error",
            "mcp-server",
            "mcp-entry-invalid",
            `Unsupported MCP declaration '${name}'.`,
            name,
          ),
        );
        continue;
      }
      mcpServers.push({ name, entry: parsed.data });
    }
  }
  return {
    manifest: manifest as AgentPluginManifest,
    skills: [...new Set(skills)],
    mcpServers,
    mcpFiles: [...new Set(locations)]
      .map((path) => join(root, path))
      .filter((path) => relativePolicyPath(root, path) !== undefined),
    diagnostics,
  };
}

export function isSkillDirectory(path: string): boolean {
  try {
    return statSync(join(path, "SKILL.md")).isFile();
  } catch {
    return false;
  }
}
