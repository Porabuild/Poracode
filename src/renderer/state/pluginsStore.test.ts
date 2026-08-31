import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListPluginsPayload, LoadedPlugin, ProjectLocation } from "@/shared/contracts";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL } from "@/shared/plugins/spec";
import { pluginScopeKey, selectPluginsForScope, usePlugins } from "./pluginsStore";

const PROJECT: ProjectLocation = { kind: "windows", path: "C:\\repo" };

function plugin(name: string, source: LoadedPlugin["source"]): LoadedPlugin {
  return {
    name,
    source,
    root: `/plugins/${name}`,
    manifest: { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name, version: "1.0.0" },
    poracode: {
      category: "developer-tools",
      featured: false,
      communityMaintained: false,
      defaultEnabled: true,
      alwaysEnabled: false,
      nativePluginNames: [],
      builtInMcpServerIds: [],
      skills: {},
    },
    skills: [],
    mcpServers: [],
    diagnostics: [],
  };
}

const originalPoracode = window.poracode;
const listPlugins = vi.fn<(payload: ListPluginsPayload) => Promise<unknown>>();
const refreshPlugins = vi.fn<(payload: ListPluginsPayload) => Promise<unknown>>();

beforeEach(() => {
  listPlugins.mockReset();
  refreshPlugins.mockReset();
  window.poracode = { listPlugins, refreshPlugins } as unknown as typeof window.poracode;
  usePlugins.setState({
    pluginsByScope: {},
    userPluginsDir: "",
    loadedScopes: {},
    loading: {},
    revision: 0,
    error: undefined,
  });
});

afterEach(() => {
  window.poracode = originalPoracode;
});

describe("plugins store scopes", () => {
  it("keeps a project's packages out of the app-global scope", async () => {
    listPlugins.mockResolvedValueOnce({
      plugins: [plugin("browser-tools", "bundled")],
      userPluginsDir: "C:\\Users\\dev\\.poracode\\plugins",
    });
    await usePlugins.getState().load();

    listPlugins.mockResolvedValueOnce({
      plugins: [plugin("browser-tools", "bundled"), plugin("repo-tools", "project")],
      userPluginsDir: "C:\\Users\\dev\\.poracode\\plugins",
    });
    await usePlugins.getState().load({ projectLocation: PROJECT });

    expect(listPlugins).toHaveBeenLastCalledWith({ projectLocation: PROJECT });
    const state = usePlugins.getState();
    expect(selectPluginsForScope(state, PROJECT).map((entry) => entry.name)).toEqual([
      "browser-tools",
      "repo-tools",
    ]);
    expect(selectPluginsForScope(state).map((entry) => entry.name)).toEqual(["browser-tools"]);
  });

  it("serves the app-global list until a project scope has loaded", () => {
    usePlugins.setState({
      pluginsByScope: { "": [plugin("browser-tools", "bundled")] },
      loadedScopes: { "": true },
    });

    expect(selectPluginsForScope(usePlugins.getState(), PROJECT).map((e) => e.name)).toEqual([
      "browser-tools",
    ]);
  });

  it("drops other scopes on a rescan so a changed package is never served stale", async () => {
    usePlugins.setState({
      pluginsByScope: { "": [plugin("stale", "user")], [pluginScopeKey(PROJECT)]: [] },
      loadedScopes: { "": true, [pluginScopeKey(PROJECT)]: true },
    });
    refreshPlugins.mockResolvedValueOnce({
      plugins: [plugin("repo-tools", "project")],
      userPluginsDir: "C:\\Users\\dev\\.poracode\\plugins",
    });

    await usePlugins.getState().load({ projectLocation: PROJECT, rescan: true });

    expect(Object.keys(usePlugins.getState().pluginsByScope)).toEqual([pluginScopeKey(PROJECT)]);
  });

  it("ignores a second load for a scope already in flight", async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    listPlugins.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const first = usePlugins.getState().load();
    await usePlugins.getState().load();
    expect(listPlugins).toHaveBeenCalledTimes(1);

    resolveFirst({ plugins: [], userPluginsDir: "C:\\Users\\dev\\.poracode\\plugins" });
    await first;
    expect(usePlugins.getState().loadedScopes[""]).toBe(true);
  });
});
