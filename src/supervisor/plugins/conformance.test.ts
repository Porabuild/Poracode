import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstalledPlugins } from "@/shared/contracts";
import { isValidSkillName } from "@/shared/contracts";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  AGENT_PLUGINS_MCP_SCHEMA_URL,
  isPluginMcpUrlAllowed,
  isValidPluginName,
} from "@/shared/plugins/spec";
import { loadPluginFromDirectory } from "./PluginLoader";
import { PluginRegistry, PROJECT_PLUGINS_DIR } from "./PluginRegistry";
import { resolvePluginMcpServers } from "./pluginMcpRuntime";

/**
 * Client conformance for Agent Plugins Specification 1.0.0.
 *
 * Each case maps to a line in the published client checklist and the
 * failure-boundary table.
 *
 * @see https://agent-plugins.org/client-implementers/conformance
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "poracode-agent-plugins-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writePackage(
  name: string,
  files: {
    manifest?: unknown;
    manifestText?: string;
    skills?: Record<string, string | null>;
    mcp?: unknown;
    mcpText?: string;
  },
): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  if (files.manifestText !== undefined) {
    await writeFile(join(dir, "plugin.json"), files.manifestText, "utf8");
  } else if (files.manifest !== undefined) {
    await writeFile(join(dir, "plugin.json"), JSON.stringify(files.manifest), "utf8");
  }
  for (const [folder, body] of Object.entries(files.skills ?? {})) {
    const skillDir = join(dir, "skills", folder);
    await mkdir(skillDir, { recursive: true });
    if (body !== null) await writeFile(join(skillDir, "SKILL.md"), body, "utf8");
  }
  if (files.mcpText !== undefined) {
    await writeFile(join(dir, "mcp.json"), files.mcpText, "utf8");
  } else if (files.mcp !== undefined) {
    await writeFile(join(dir, "mcp.json"), JSON.stringify(files.mcp), "utf8");
  }
  return dir;
}

const manifest = (name: string, extra: Record<string, unknown> = {}) => ({
  $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  name,
  ...extra,
});

const skillBody = (name: string) =>
  `---\nname: ${JSON.stringify(name)}\ndescription: "${name} description"\n---\n\n# ${name}\n`;

const codes = (diagnostics: readonly { code: string }[]) => diagnostics.map((d) => d.code);

const installedPluginState = (name: string): InstalledPlugins => ({
  [name]: {
    version: "1.0.0",
    enabled: true,
    disabledSkillIds: [],
    disabledMcpServerNames: [],
  },
});

describe("plugin name validation", () => {
  it("accepts and rejects names per the specification", () => {
    expect(isValidPluginName("a")).toBe(true);
    expect(isValidPluginName("my-plugin.v2")).toBe(true);
    expect(isValidPluginName("")).toBe(false);
    expect(isValidPluginName("A")).toBe(false);
    expect(isValidPluginName("-lead")).toBe(false);
    expect(isValidPluginName("trail-")).toBe(false);
    expect(isValidPluginName("double--hyphen")).toBe(false);
    expect(isValidPluginName("double..period")).toBe(false);
    expect(isValidPluginName("x".repeat(65))).toBe(false);
    expect(isValidPluginName("x".repeat(64))).toBe(true);
  });
});

describe("manifest loading", () => {
  it("loads a minimal package with only the two required fields", async () => {
    const dir = await writePackage("minimal", { manifest: manifest("minimal") });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin).toMatchObject({ name: "minimal", skills: [], mcpServers: [] });
    expect(result.diagnostics).toEqual([]);
  });

  it("reports and ignores unknown top-level fields without rejecting the plugin", async () => {
    const dir = await writePackage("unknown-field", {
      manifest: manifest("unknown-field", { totallyUnknown: { a: 1 } }),
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.name).toBe("unknown-field");
    expect(codes(result.diagnostics)).toEqual(["manifest-unknown-field"]);
  });

  it("reports and ignores a non-object extensions field", async () => {
    const dir = await writePackage("bad-extensions", {
      manifest: manifest("bad-extensions", { extensions: "nope" }),
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.manifest.extensions).toBeUndefined();
    expect(codes(result.diagnostics)).toEqual(["manifest-extensions-not-object"]);
  });

  it("rejects a plugin whose name violates the specification", async () => {
    const dir = await writePackage("bad-name", { manifest: manifest("Bad_Name") });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin).toBeUndefined();
    expect(codes(result.diagnostics)).toContain("manifest-invalid");
  });

  it("rejects an unknown $schema instead of retrieving it", async () => {
    const dir = await writePackage("future", {
      manifest: {
        $schema: "https://agent-plugins.org/schemas/9.9.9/plugin.schema.json",
        name: "f",
      },
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin).toBeUndefined();
    expect(codes(result.diagnostics)).toEqual(["manifest-schema-unsupported"]);
  });

  it("rejects a package with unreadable JSON", async () => {
    const dir = await writePackage("broken", { manifestText: "{ not json" });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin).toBeUndefined();
    expect(codes(result.diagnostics)).toEqual(["manifest-unreadable"]);
  });

  it("rejects a directory with no manifest", async () => {
    const dir = await writePackage("empty", {});
    expect(loadPluginFromDirectory(dir, "bundled").plugin).toBeUndefined();
  });
});

describe("component discovery", () => {
  it("reports a configured core skill that the package does not ship", async () => {
    const dir = await writePackage("missing-core", {
      manifest: manifest("missing-core", {
        extensions: {
          "com.poracode.client": { coreSkill: "missing" },
        },
      }),
      skills: { present: skillBody("present") },
    });

    const result = loadPluginFromDirectory(dir, "bundled");
    expect(result.plugin?.poracode.coreSkill).toBe("missing");
    expect(codes(result.diagnostics)).toEqual(["extension-unknown-skill"]);
  });

  it("discovers immediate skill directories and does not recurse", async () => {
    const dir = await writePackage("skills", {
      manifest: manifest("skills"),
      skills: { alpha: skillBody("alpha"), beta: skillBody("beta") },
    });
    await mkdir(join(dir, "skills", "alpha", "nested"), { recursive: true });
    await writeFile(
      join(dir, "skills", "alpha", "nested", "SKILL.md"),
      skillBody("nested"),
      "utf8",
    );

    const result = loadPluginFromDirectory(dir, "bundled");
    expect(result.plugin?.skills.map((skill) => skill.folder)).toEqual(["alpha", "beta"]);
  });

  it("skips a directory that has no SKILL.md without reporting an error", async () => {
    const dir = await writePackage("partial", {
      manifest: manifest("partial"),
      skills: { good: skillBody("good"), empty: null },
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.skills.map((skill) => skill.folder)).toEqual(["good"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("treats missing component locations as a valid absence", async () => {
    const dir = await writePackage("bare", { manifest: manifest("bare") });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.diagnostics).toEqual([]);
    expect(result.plugin).toBeDefined();
  });

  it("disables only the component type when a location has the wrong filesystem kind", async () => {
    const dir = await writePackage("wrong-kind", { manifest: manifest("wrong-kind") });
    await writeFile(join(dir, "skills"), "not a directory", "utf8");
    await mkdir(join(dir, "mcp.json"), { recursive: true });

    const result = loadPluginFromDirectory(dir, "bundled");
    expect(result.plugin).toBeDefined();
    expect(codes(result.diagnostics)).toEqual([
      "skills-location-wrong-kind",
      "mcp-location-wrong-kind",
    ]);
  });
});

describe("package boundary", () => {
  it("skips a skill that resolves outside the package boundary", async ({ skip }) => {
    const outside = join(root, "outside-skill");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), skillBody("escaped"), "utf8");
    const dir = await writePackage("escaping", {
      manifest: manifest("escaping"),
      skills: { kept: skillBody("kept") },
    });
    try {
      await symlink(outside, join(dir, "skills", "escaped"), "junction");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["EACCES", "ENOSYS", "ENOTSUP", "EPERM", "UNKNOWN"].includes(code ?? "")) {
        skip();
        return;
      }
      throw error;
    }

    const result = loadPluginFromDirectory(dir, "bundled");
    expect(result.plugin?.skills.map((skill) => skill.folder)).toEqual(["kept"]);
    expect(codes(result.diagnostics)).toEqual(["path-escapes-root"]);
  });
});

describe("mcp.json", () => {
  const mcpDoc = (servers: Record<string, unknown>) => ({
    $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
    mcpServers: servers,
  });

  it("validates the document and each entry independently", async () => {
    const dir = await writePackage("mixed-servers", {
      manifest: manifest("mixed-servers"),
      mcp: mcpDoc({
        good: { type: "stdio", command: "server" },
        bad: { type: "stdio" },
        remote: { type: "streamable-http", url: "https://tools.example.com/mcp" },
      }),
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.mcpServers.map((server) => server.name)).toEqual(["good", "remote"]);
    expect(codes(result.diagnostics)).toEqual(["mcp-entry-invalid"]);
  });

  it("accepts the legacy sse transport", async () => {
    const dir = await writePackage("legacy", {
      manifest: manifest("legacy"),
      mcp: mcpDoc({ old: { type: "sse", url: "https://tools.example.com/sse" } }),
    });
    expect(loadPluginFromDirectory(dir, "bundled").plugin?.mcpServers[0]?.entry.type).toBe("sse");
  });

  it("disables MCP servers when the document schema is unsupported", async () => {
    const dir = await writePackage("bad-mcp-schema", {
      manifest: manifest("bad-mcp-schema"),
      mcp: { $schema: "https://example.com/other.json", mcpServers: {} },
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.mcpServers).toEqual([]);
    expect(codes(result.diagnostics)).toEqual(["mcp-schema-unsupported"]);
  });

  it("requires absolute https urls, allowing http only for loopback", () => {
    expect(isPluginMcpUrlAllowed("https://tools.example.com/mcp")).toBe(true);
    expect(isPluginMcpUrlAllowed("http://localhost:3000/mcp")).toBe(true);
    expect(isPluginMcpUrlAllowed("http://127.0.0.1:3000/mcp")).toBe(true);
    expect(isPluginMcpUrlAllowed("http://[::1]:3000/mcp")).toBe(true);
    expect(isPluginMcpUrlAllowed("http://tools.example.com/mcp")).toBe(false);
    expect(isPluginMcpUrlAllowed("/relative")).toBe(false);
  });
});

describe("mcp runtime", () => {
  const installed = (name: string): InstalledPlugins => ({
    [name]: {
      version: "1.0.0",
      enabled: true,
      disabledSkillIds: [],
      disabledMcpServerNames: [],
    },
  });

  async function loadWithServers(name: string, servers: Record<string, unknown>) {
    const dir = await writePackage(name, {
      manifest: manifest(name),
      mcp: { $schema: AGENT_PLUGINS_MCP_SCHEMA_URL, mcpServers: servers },
    });
    const plugin = loadPluginFromDirectory(dir, "bundled").plugin;
    if (!plugin) throw new Error("plugin failed to load");
    return plugin;
  }

  it("expands placeholders only in args, env values, and cwd", async () => {
    const plugin = await loadWithServers("expansion", {
      main: {
        type: "stdio",
        command: "server",
        args: ["--data", "${PLUGIN_DATA}", "--root", "${PLUGIN_ROOT}"],
        env: { DATA: "${PLUGIN_DATA}", LITERAL: "no placeholder" },
        cwd: "${PLUGIN_ROOT}",
      },
    });
    const pluginDataRoot = join(root, "plugin-data");
    const { servers } = resolvePluginMcpServers([plugin], installed("expansion"), {
      pluginDataRoot,
    });
    const transport = servers[0]?.transport;

    expect(servers[0]?.name).toBe("expansion.main");
    expect(transport).toMatchObject({
      type: "stdio",
      command: "server",
      args: ["--data", join(pluginDataRoot, "expansion"), "--root", plugin.root],
      cwd: plugin.root,
    });
    expect(transport?.type === "stdio" && transport.env).toEqual({
      DATA: join(pluginDataRoot, "expansion"),
      LITERAL: "no placeholder",
      PLUGIN_ROOT: plugin.root,
      PLUGIN_DATA: join(pluginDataRoot, "expansion"),
    });
  });

  it("does not let configured env override PLUGIN_ROOT or PLUGIN_DATA", async () => {
    const plugin = await loadWithServers("env-precedence", {
      main: {
        type: "stdio",
        command: "server",
        env: { PLUGIN_ROOT: "/hijacked", PLUGIN_DATA: "/hijacked" },
      },
    });
    const pluginDataRoot = join(root, "plugin-data");
    const { servers } = resolvePluginMcpServers([plugin], installed("env-precedence"), {
      pluginDataRoot,
    });
    const transport = servers[0]?.transport;

    expect(transport?.type === "stdio" && transport.env).toMatchObject({
      PLUGIN_ROOT: plugin.root,
      PLUGIN_DATA: join(pluginDataRoot, "env-precedence"),
    });
  });

  it("does not expand placeholders in remote headers", async () => {
    const plugin = await loadWithServers("headers", {
      remote: {
        type: "streamable-http",
        url: "https://tools.example.com/mcp",
        headers: { "X-Root": "${PLUGIN_ROOT}" },
      },
    });
    const { servers } = resolvePluginMcpServers([plugin], installed("headers"), {
      pluginDataRoot: join(root, "plugin-data"),
    });

    expect(servers[0]?.transport).toMatchObject({
      type: "http",
      headers: { "X-Root": "${PLUGIN_ROOT}" },
    });
  });

  it("resolves a './' command against the plugin root and rejects other paths", async () => {
    const relative = await loadWithServers("relative-cmd", {
      main: { type: "stdio", command: "./bin/server" },
    });
    const escaping = await loadWithServers("escaping-cmd", {
      main: { type: "stdio", command: "../outside/server" },
    });
    const context = { pluginDataRoot: join(root, "plugin-data") };

    expect(
      resolvePluginMcpServers([relative], installed("relative-cmd"), context).servers[0]?.transport,
    ).toMatchObject({ command: join(relative.root, "bin", "server") });

    const rejected = resolvePluginMcpServers([escaping], installed("escaping-cmd"), context);
    expect(rejected.servers).toEqual([]);
    expect(codes(rejected.diagnostics)).toEqual(["mcp-entry-unresolvable"]);
  });

  it("skips MCP servers unsupported by the host or project", async () => {
    const plugin = await writePackage("unsupported", {
      manifest: manifest("unsupported", {
        extensions: {
          "com.poracode.client": {
            platforms: ["darwin"],
            projectKinds: ["windows"],
          },
        },
      }),
      mcp: {
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { main: { type: "stdio", command: "server" } },
      },
    });
    const loaded = loadPluginFromDirectory(plugin, "bundled").plugin;
    if (!loaded) throw new Error("plugin failed to load");
    const context = {
      pluginDataRoot: join(root, "plugin-data"),
      hostPlatform: "win32" as const,
      projectLocation: {
        kind: "wsl" as const,
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
    };

    expect(resolvePluginMcpServers([loaded], installed("unsupported"), context).servers).toEqual(
      [],
    );
  });

  it("rejects stdio command and cwd symlinks that escape the package", async ({ skip }) => {
    const outside = join(root, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "server"), "", "utf8");
    const commandDir = await writePackage("symlink-command", {
      manifest: manifest("symlink-command"),
      mcp: {
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { main: { type: "stdio", command: "./bin/server" } },
      },
    });
    const cwdDir = await writePackage("symlink-cwd", {
      manifest: manifest("symlink-cwd"),
      mcp: {
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { main: { type: "stdio", command: "server", cwd: "./work" } },
      },
    });
    try {
      await symlink(outside, join(commandDir, "bin"), "junction");
      await symlink(outside, join(cwdDir, "work"), "junction");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["EACCES", "ENOSYS", "ENOTSUP", "EPERM", "UNKNOWN"].includes(code ?? "")) {
        skip();
        return;
      }
      throw error;
    }

    const commandPlugin = loadPluginFromDirectory(commandDir, "bundled").plugin;
    const cwdPlugin = loadPluginFromDirectory(cwdDir, "bundled").plugin;
    if (!commandPlugin || !cwdPlugin) throw new Error("plugin failed to load");
    const result = resolvePluginMcpServers(
      [commandPlugin, cwdPlugin],
      { ...installed("symlink-command"), ...installed("symlink-cwd") },
      { pluginDataRoot: join(root, "plugin-data") },
    );

    expect(result.servers).toEqual([]);
    expect(codes(result.diagnostics)).toEqual(["mcp-entry-unresolvable", "mcp-entry-unresolvable"]);
  });

  it("rejects a cwd that escapes the package boundary", async () => {
    const plugin = await loadWithServers("bad-cwd", {
      main: { type: "stdio", command: "server", cwd: "../outside" },
    });
    const result = resolvePluginMcpServers([plugin], installed("bad-cwd"), {
      pluginDataRoot: join(root, "plugin-data"),
    });

    expect(result.servers).toEqual([]);
    expect(codes(result.diagnostics)).toEqual(["mcp-entry-unresolvable"]);
  });

  it("keeps sibling servers when one entry cannot be resolved", async () => {
    const plugin = await loadWithServers("isolation", {
      broken: { type: "stdio", command: "/absolute/server" },
      working: { type: "stdio", command: "server" },
    });
    const result = resolvePluginMcpServers([plugin], installed("isolation"), {
      pluginDataRoot: join(root, "plugin-data"),
    });

    expect(result.servers.map((server) => server.name)).toEqual(["isolation.working"]);
    expect(codes(result.diagnostics)).toEqual(["mcp-entry-unresolvable"]);
  });

  it("skips host-only stdio servers for a WSL project but keeps remote ones", async () => {
    const plugin = await loadWithServers("wsl-mix", {
      local: { type: "stdio", command: "server" },
      remote: { type: "streamable-http", url: "https://tools.example.com/mcp" },
    });
    const context = { pluginDataRoot: join(root, "plugin-data") };
    const wsl = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };

    // A stdio server is launched by the CLI inside the distro; every path we
    // would hand it is a Windows host path that cannot resolve there.
    const onWsl = resolvePluginMcpServers([plugin], installed("wsl-mix"), {
      ...context,
      projectLocation: wsl,
    });
    expect(onWsl.servers.map((server) => server.name)).toEqual(["wsl-mix.remote"]);
    expect(codes(onWsl.diagnostics)).toEqual(["mcp-entry-host-only"]);

    const onWindows = resolvePluginMcpServers([plugin], installed("wsl-mix"), {
      ...context,
      projectLocation: { kind: "windows", path: "C:\repo" },
    });
    expect(onWindows.servers.map((server) => server.name)).toEqual([
      "wsl-mix.local",
      "wsl-mix.remote",
    ]);
    expect(onWindows.diagnostics).toEqual([]);
  });

  it("skips servers a plugin is not installed or enabled for", async () => {
    const plugin = await loadWithServers("gated", {
      main: { type: "stdio", command: "server" },
    });
    const context = { pluginDataRoot: join(root, "plugin-data") };

    expect(resolvePluginMcpServers([plugin], {}, context).servers).toEqual([]);
    expect(
      resolvePluginMcpServers(
        [plugin],
        { gated: { ...installed("gated").gated!, enabled: false } },
        context,
      ).servers,
    ).toEqual([]);
    expect(
      resolvePluginMcpServers(
        [plugin],
        { gated: { ...installed("gated").gated!, disabledMcpServerNames: ["main"] } },
        context,
      ).servers,
    ).toEqual([]);
  });

  it("skips a server whose namespaced name is not usable", async () => {
    const plugin = await loadWithServers("naming", {
      // Composes to "naming.my server", which is not a usable MCP server name.
      "my server": { type: "stdio", command: "server" },
    });
    const result = resolvePluginMcpServers([plugin], installed("naming"), {
      pluginDataRoot: join(root, "plugin-data"),
    });

    expect(result.servers).toEqual([]);
    expect(codes(result.diagnostics)).toEqual(["mcp-name-unusable"]);
  });

  it("rejects an empty server name in mcp.json", async () => {
    const dir = await writePackage("empty-name", {
      manifest: manifest("empty-name"),
      mcp: {
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { "": { type: "stdio", command: "server" } },
      },
    });
    const result = loadPluginFromDirectory(dir, "bundled");

    expect(result.plugin?.mcpServers).toEqual([]);
    expect(codes(result.diagnostics)).toEqual(["mcp-entry-invalid"]);
  });
});

describe("registry", () => {
  it("prefers a bundled package over a user package with the same name", async () => {
    const bundledDir = join(root, "bundled");
    const userDir = join(root, "user");
    await mkdir(join(bundledDir, "dup"), { recursive: true });
    await mkdir(join(userDir, "dup"), { recursive: true });
    await writeFile(
      join(bundledDir, "dup", "plugin.json"),
      JSON.stringify(manifest("dup", { version: "1.0.0" })),
      "utf8",
    );
    await writeFile(
      join(userDir, "dup", "plugin.json"),
      JSON.stringify(manifest("dup", { version: "2.0.0" })),
      "utf8",
    );

    const registry = new PluginRegistry({
      bundledPluginsDir: () => bundledDir,
      userPluginsDir: () => userDir,
    });
    const plugins = registry.listPlugins();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({ source: "bundled", manifest: { version: "1.0.0" } });
  });

  it("ignores directories without a manifest and rescans on refresh", async () => {
    const userDir = join(root, "user");
    await mkdir(join(userDir, "not-a-plugin"), { recursive: true });
    const registry = new PluginRegistry({
      bundledPluginsDir: () => undefined,
      userPluginsDir: () => userDir,
    });
    expect(registry.listPlugins()).toEqual([]);

    await mkdir(join(userDir, "added"), { recursive: true });
    await writeFile(
      join(userDir, "added", "plugin.json"),
      JSON.stringify(manifest("added")),
      "utf8",
    );
    registry.refresh();

    expect(registry.listPlugins().map((plugin) => plugin.name)).toEqual(["added"]);
  });

  it("loads a project's own packages only for that project", async () => {
    const userDir = join(root, "user");
    const projectDir = join(root, "project");
    await mkdir(userDir, { recursive: true });
    await mkdir(join(projectDir, PROJECT_PLUGINS_DIR, "repo-tools"), { recursive: true });
    await writeFile(
      join(projectDir, PROJECT_PLUGINS_DIR, "repo-tools", "plugin.json"),
      JSON.stringify(manifest("repo-tools")),
      "utf8",
    );

    const registry = new PluginRegistry({
      bundledPluginsDir: () => undefined,
      userPluginsDir: () => userDir,
    });

    expect(registry.listPlugins()).toEqual([]);
    expect(registry.listPlugins(projectDir).map((plugin) => plugin.name)).toEqual(["repo-tools"]);
    expect(registry.listPlugins(projectDir)[0]).toMatchObject({ source: "project" });
    // A second project must not inherit the first one's packages.
    expect(registry.listPlugins(join(root, "other-project"))).toEqual([]);
  });

  it("keeps a repository package from shadowing a bundled or user one", async () => {
    const bundledDir = join(root, "bundled");
    const userDir = join(root, "user");
    const projectDir = join(root, "project");
    for (const [dir, version] of [
      [join(bundledDir, "dup"), "1.0.0"],
      [join(userDir, "mine"), "1.0.0"],
      [join(projectDir, PROJECT_PLUGINS_DIR, "dup"), "9.0.0"],
      [join(projectDir, PROJECT_PLUGINS_DIR, "mine"), "9.0.0"],
    ] as const) {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "plugin.json"),
        JSON.stringify(manifest(basename(dir), { version })),
        "utf8",
      );
    }

    const registry = new PluginRegistry({
      bundledPluginsDir: () => bundledDir,
      userPluginsDir: () => userDir,
    });

    expect(registry.listPlugins(projectDir)).toEqual([
      expect.objectContaining({ name: "dup", source: "bundled" }),
      expect.objectContaining({ name: "mine", source: "user" }),
    ]);
  });

  it("does not scan the user plugin folder twice for a home-scope project", async () => {
    const home = join(root, "home");
    const userDir = join(home, PROJECT_PLUGINS_DIR);
    await mkdir(join(userDir, "mine"), { recursive: true });
    await writeFile(join(userDir, "mine", "plugin.json"), JSON.stringify(manifest("mine")), "utf8");

    const registry = new PluginRegistry({
      bundledPluginsDir: () => undefined,
      userPluginsDir: () => userDir,
    });

    expect(registry.listPlugins(home)).toEqual([
      expect.objectContaining({ name: "mine", source: "user" }),
    ]);
  });
});

describe("shipped packages", () => {
  it("loads every package in resources/plugins", () => {
    const shippedDir = join(process.cwd(), "resources", "plugins");
    const shipped = [
      "app-controls",
      "browser-tools",
      "chrome-tools",
      "computer-use",
      "github",
      "outlook",
      "subagent-delegation",
      "terminal",
    ];
    for (const name of shipped) {
      const result = loadPluginFromDirectory(join(shippedDir, name), "bundled");
      expect(result.diagnostics, `${name}: ${JSON.stringify(result.diagnostics)}`).toEqual([]);
      expect(result.plugin?.name).toBe(name);
      expect(result.plugin?.skills.length).toBeGreaterThan(0);
      expect(result.plugin?.poracode.title).toBeTruthy();

      // SkillsService rejects a SKILL.md whose frontmatter `name` is not the
      // folder name, and the Skills list then shows the rejection reason where
      // the description belongs. Prove every shipped skill passes that gate.
      for (const skill of result.plugin?.skills ?? []) {
        const frontmatter = readFileSync(join(skill.path, "SKILL.md"), "utf8");
        const declared = /^name:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/mu.exec(frontmatter)?.[1];
        expect(declared, `${name}/${skill.folder} has no frontmatter name`).toBeTruthy();
        expect(isValidSkillName(declared!), `${name}/${skill.folder} name '${declared}'`).toBe(
          true,
        );
        expect(declared, `${name}/${skill.folder} name must match its folder`).toBe(skill.folder);

        // The Skills list and the plugin detail page read their labels from the
        // manifest policy, so a skill missing one shows a bare folder name.
        const policy = result.plugin?.poracode.skills[skill.folder];
        expect(policy?.name, `${name}/${skill.folder} has no policy name`).toBeTruthy();
        expect(
          policy?.description,
          `${name}/${skill.folder} has no policy description`,
        ).toBeTruthy();
      }

      // Every package ships its core skill plus at least one supporting skill,
      // so an agent has both the "how to work with these tools" entry point and
      // a skill for the concrete job.
      const core = result.plugin?.poracode.coreSkill;
      expect(core, `${name} declares no core skill`).toBeTruthy();
      expect(
        result.plugin?.skills.some((skill) => skill.folder === core),
        `${name} core skill '${core}' is not shipped`,
      ).toBe(true);
    }
  });

  it("ships a supporting skill with concrete guidance for every package", () => {
    const shippedDir = join(process.cwd(), "resources", "plugins");
    // One supporting skill per package, keyed to the job an agent actually does
    // with those tools, with the marker that proves it is not filler.
    const supporting: Record<string, { folder: string; markers: string[] }> = {
      "browser-tools": {
        folder: "web-app-verification",
        markers: ["browser.console", "browser.requests", "browser.disable"],
      },
      "chrome-tools": {
        folder: "signed-in-research",
        markers: ["chrome.status", "chrome.attach", "chrome.disable"],
      },
      "computer-use": {
        folder: "desktop-app-testing",
        markers: ["computer_use.enable", "get_window_state", "computer_use.disable"],
      },
      github: { folder: "ci-debug", markers: ["## Find the real failure", "## Report"] },
      outlook: { folder: "meeting-prep", markers: ["time zone", "read-only"] },
      "subagent-delegation": {
        folder: "parallel-review",
        markers: ["spawn_agent", "read-only"],
      },
    };

    for (const [name, { folder, markers }] of Object.entries(supporting)) {
      const plugin = loadPluginFromDirectory(join(shippedDir, name), "bundled").plugin!;
      expect(
        plugin.poracode.coreSkill,
        `${name} supporting skill must not be the core one`,
      ).not.toBe(folder);
      const skill = plugin.skills.find((candidate) => candidate.folder === folder);
      expect(skill, `${name} does not ship '${folder}'`).toBeTruthy();
      const contents = readFileSync(join(skill!.path, "SKILL.md"), "utf8");
      for (const marker of markers) {
        expect(contents, `${name}/${folder} lacks '${marker}'`).toContain(marker);
      }
    }
  });

  it("ships goal-specific core skill guidance for every package", () => {
    const shippedDir = join(process.cwd(), "resources", "plugins");
    const expectations: Record<string, string[]> = {
      "app-controls": [
        "## Workflow",
        "## Boundaries",
        "## Output",
        "list_terminals",
        "read_terminal",
      ],
      "browser-tools": [
        "## Workflow",
        "## Boundaries",
        "## Output",
        "browser.enable",
        "browser.disable",
      ],
      "chrome-tools": [
        "## Workflow",
        "## Boundaries",
        "## Output",
        "chrome.enable",
        "chrome.disable",
      ],
      "computer-use": [
        "## Workflow",
        "## Boundaries",
        "## Output",
        "computer_use.enable",
        "computer_use.disable",
      ],
      github: ["## Before you start", "## Reading", "## Writing", "## Reporting", "Related skills"],
      outlook: ["## Before you start", "## Triage", "## Drafting and sending", "## Report"],
      "subagent-delegation": [
        "## Decide whether to delegate",
        "## Workflow",
        "## Safety and retries",
        "## Output",
      ],
      terminal: ["## Find the pane", "## Read it", "## Report", "list_terminals", "read_terminal"],
    };

    for (const [name, markers] of Object.entries(expectations)) {
      const plugin = loadPluginFromDirectory(join(shippedDir, name), "bundled").plugin!;
      const coreSkill = plugin.skills.find((skill) => skill.folder === plugin.poracode.coreSkill);
      expect(coreSkill, `${name} has no configured core skill`).toBeTruthy();
      expect(plugin.poracode.examplePrompt, `${name} has no example prompt`).toBeTruthy();
      const contents = readFileSync(join(coreSkill!.path, "SKILL.md"), "utf8");
      for (const marker of markers) {
        expect(contents, `${name} core skill lacks '${marker}'`).toContain(marker);
      }
    }
  });

  it("binds built-in MCPs and suppresses the whole package when Codex owns it natively", () => {
    const shippedDir = join(process.cwd(), "resources", "plugins");
    const browser = loadPluginFromDirectory(join(shippedDir, "browser-tools"), "bundled").plugin!;
    const github = loadPluginFromDirectory(join(shippedDir, "github"), "bundled").plugin!;
    const context = { pluginDataRoot: join(root, "plugin-data"), hostPlatform: "win32" as const };

    // browser-tools only wraps a server the app already owns, so it never
    // forces it on: the per-thread composer toggle stays the enablement truth.
    expect(
      resolvePluginMcpServers([browser], installedPluginState("browser-tools"), context),
    ).toMatchObject({
      servers: [],
      builtInMcpServerIds: [],
    });
    // A package the user dropped in is not part of the app, so its declared
    // built-in binding still applies for the launch.
    expect(
      resolvePluginMcpServers(
        [{ ...browser, source: "user" as const }],
        installedPluginState("browser-tools"),
        context,
      ),
    ).toMatchObject({ servers: [], builtInMcpServerIds: ["browser"] });
    expect(
      resolvePluginMcpServers([browser], installedPluginState("browser-tools"), {
        ...context,
        nativePluginNames: new Set(["browser"]),
      }),
    ).toMatchObject({ servers: [], builtInMcpServerIds: [] });

    expect(
      resolvePluginMcpServers([github], installedPluginState("github"), context).servers,
    ).toHaveLength(1);
    expect(
      resolvePluginMcpServers([github], installedPluginState("github"), {
        ...context,
        nativePluginNames: new Set(["github"]),
      }).servers,
    ).toEqual([]);

    const outlook = loadPluginFromDirectory(join(shippedDir, "outlook"), "bundled").plugin!;
    expect(
      resolvePluginMcpServers([outlook], installedPluginState("outlook"), {
        ...context,
        nativePluginNames: new Set(["outlook-email"]),
      }).servers,
    ).toHaveLength(1);
    expect(
      resolvePluginMcpServers([outlook], installedPluginState("outlook"), {
        ...context,
        nativePluginNames: new Set(["outlook-email", "outlook-calendar"]),
      }).servers,
    ).toEqual([]);
  });
});
