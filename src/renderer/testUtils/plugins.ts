import type { LoadedPlugin } from "@/shared/contracts";
import { BUNDLED_PLUGIN_MANIFESTS } from "@/shared/plugins/builtInCoreSkills";
import { parsePluginManifest, parsePoracodeExtension } from "@/shared/plugins/spec";
import { usePlugins } from "@/renderer/state/pluginsStore";

/**
 * Seeds the renderer plugin store from the real shipped manifests.
 *
 * The manifest JSON is imported directly rather than loaded through the
 * supervisor's `PluginLoader` — the renderer must not reach into supervisor
 * code, and only the manifest matters here. Skill folders are taken from the
 * manifest's own extension block, so a package that changes its contributions
 * changes these fixtures with it. Loader behavior itself is covered by
 * `src/supervisor/plugins/conformance.test.ts`.
 */

const SHIPPED_MANIFESTS = BUNDLED_PLUGIN_MANIFESTS;

function toLoadedPlugin(raw: unknown): LoadedPlugin {
  const parsed = parsePluginManifest(raw);
  if (!parsed.manifest) {
    throw new Error(
      `shipped plugin manifest is invalid: ${parsed.diagnostics.map((d) => d.message).join("; ")}`,
    );
  }
  const manifest = parsed.manifest;
  const { extension } = parsePoracodeExtension(manifest);
  const root = `/resources/plugins/${manifest.name}`;
  return {
    name: manifest.name,
    source: "bundled",
    root,
    manifest,
    poracode: extension,
    skills: Object.keys(extension.skills).map((folder) => ({
      folder,
      path: `${root}/skills/${folder}`,
    })),
    mcpServers: [],
    diagnostics: [],
  };
}

export function loadBuiltInPluginFixtures(): LoadedPlugin[] {
  return SHIPPED_MANIFESTS.map(toLoadedPlugin);
}

export function seedBuiltInPlugins(): LoadedPlugin[] {
  const plugins = loadBuiltInPluginFixtures();
  usePlugins.setState({
    pluginsByScope: { "": plugins },
    userPluginsDir: "/home/test/.poracode/plugins",
    loadedScopes: { "": true },
    loading: {},
    error: undefined,
  });
  return plugins;
}

export function pluginFixture(name: string): LoadedPlugin {
  const plugin = usePlugins
    .getState()
    .pluginsByScope[""]?.find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`plugin fixture '${name}' is not seeded`);
  return plugin;
}
