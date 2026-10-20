import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginFromDirectory } from "./PluginLoader";
import { PluginRegistry } from "./PluginRegistry";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(format: string, extra: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "poracode-plugin-adapter-"));
  roots.push(root);
  const pkg = join(root, "package");
  mkdirSync(join(pkg, format), { recursive: true });
  writeFileSync(
    join(pkg, format, "plugin.json"),
    JSON.stringify({ name: "package", version: "1.0.0", ...extra }),
  );
  mkdirSync(join(pkg, "skills", "review"), { recursive: true });
  writeFileSync(
    join(pkg, "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\nReview the code.",
  );
  return { root, pkg };
}

describe("plugin package adapters", () => {
  it.each([".claude-plugin", ".codex-plugin", ".cursor-plugin", ".zcode-plugin"])(
    "loads %s packages into the existing registry without granting native capabilities",
    (format) => {
      const { root, pkg } = fixture(format, {
        extensions: {
          "com.poracode.client": { alwaysEnabled: true, builtInMcpServerIds: ["app-controls"] },
        },
      });
      writeFileSync(
        join(pkg, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            notes: {
              type: "http",
              url: "https://example.org/mcp",
              oauth_resource: "https://example.org/mcp",
            },
          },
        }),
      );
      const registry = new PluginRegistry({
        bundledPluginsDir: () => undefined,
        userPluginsDir: () => root,
      });
      const plugin = registry.getPlugin("package");
      expect(plugin?.skills.map((skill) => skill.folder)).toEqual(["review"]);
      expect(plugin?.mcpServers[0]?.entry).toEqual({
        type: "streamable-http",
        url: "https://example.org/mcp",
        headers: {},
      });
      expect(plugin?.poracode).toMatchObject({
        defaultEnabled: false,
        alwaysEnabled: false,
        builtInMcpServerIds: [],
      });
    },
  );

  it("adapts contained skills, inline stdio, and root placeholders while reporting unsupported components", () => {
    const { pkg } = fixture(".claude-plugin", {
      skills: "./extra",
      hooks: "./hooks.json",
      apps: "./.app.json",
      dependencies: ["other"],
      mcpServers: {
        stdio: {
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/server.js"],
          env: { DATA: "${ZCODE_PLUGIN_DATA}" },
        },
        private: {
          type: "http",
          url: "https://example.org/mcp",
          headers: { Authorization: "Bearer ${user_config.token}" },
        },
      },
    });
    mkdirSync(join(pkg, "extra", "custom"), { recursive: true });
    writeFileSync(join(pkg, "extra", "custom", "SKILL.md"), "Custom skill");
    const loaded = loadPluginFromDirectory(pkg, "user");
    expect(loaded.plugin?.skills.map((skill) => skill.folder)).toEqual(["review", "custom"]);
    expect(loaded.plugin?.mcpServers).toEqual([
      {
        name: "stdio",
        entry: {
          type: "stdio",
          command: "node",
          args: ["${PLUGIN_ROOT}/server.js"],
          env: { DATA: "${PLUGIN_DATA}" },
        },
      },
    ]);
    expect(
      loaded.diagnostics
        .filter((diagnostic) => diagnostic.code === "package-capability-unsupported")
        .map((diagnostic) => diagnostic.target),
    ).toEqual(expect.arrayContaining(["apps", "hooks", "dependencies", "mcp:private"]));
  });

  it("never imports escaped component paths or unknown auth semantics", () => {
    const { pkg } = fixture(".codex-plugin", {
      skills: "../outside",
      mcpServers: {
        custom: {
          type: "http",
          url: "https://example.org/mcp",
          oauth: { clientId: "vendor-client" },
        },
      },
    });
    const loaded = loadPluginFromDirectory(pkg, "user");
    expect(loaded.plugin?.mcpServers).toEqual([]);
    expect(loaded.plugin?.skills).toHaveLength(1);
    expect(loaded.diagnostics.some((diagnostic) => diagnostic.code === "mcp-entry-invalid")).toBe(
      true,
    );
  });

  it("invalidates declared custom MCP files without an explicit refresh", () => {
    const { root, pkg } = fixture(".claude-plugin", { mcpServers: "./servers/tools.json" });
    mkdirSync(join(pkg, "servers"));
    const file = join(pkg, "servers", "tools.json");
    const write = (url: string, seconds: number) => {
      writeFileSync(file, JSON.stringify({ service: { type: "http", url } }));
      utimesSync(file, seconds, seconds);
    };
    const registry = new PluginRegistry({
      bundledPluginsDir: () => undefined,
      userPluginsDir: () => root,
    });
    write("https://first.example.org/mcp", 1_000);
    expect(registry.getPlugin("package")?.mcpServers[0]?.entry).toMatchObject({
      url: "https://first.example.org/mcp",
    });
    write("https://second.example.org/mcp", 2_000);
    expect(registry.getPlugin("package")?.mcpServers[0]?.entry).toMatchObject({
      url: "https://second.example.org/mcp",
    });
    rmSync(file);
    expect(registry.getPlugin("package")?.mcpServers).toEqual([]);
    write("https://restored.example.org/mcp", 3_000);
    expect(registry.getPlugin("package")?.mcpServers[0]?.entry).toMatchObject({
      url: "https://restored.example.org/mcp",
    });
  });

  it("supports the package root as a declared skill directory", () => {
    const { pkg } = fixture(".claude-plugin", { skills: "." });
    writeFileSync(join(pkg, "SKILL.md"), "Root skill");
    const loaded = loadPluginFromDirectory(pkg, "user");
    expect(loaded.plugin?.skills).toContainEqual({ folder: "package", path: pkg });
    expect(loaded.diagnostics.some((entry) => entry.code === "path-escapes-root")).toBe(false);
  });

  it("reports duplicate MCP names while retaining the first declaration", () => {
    const { pkg } = fixture(".claude-plugin", {
      mcpServers: { service: { type: "http", url: "https://second.example.org/mcp" } },
    });
    writeFileSync(
      join(pkg, ".mcp.json"),
      JSON.stringify({
        service: { type: "http", url: "https://first.example.org/mcp" },
      }),
    );
    const loaded = loadPluginFromDirectory(pkg, "user");
    expect(loaded.plugin?.mcpServers).toHaveLength(1);
    expect(loaded.plugin?.mcpServers[0]?.entry).toMatchObject({
      url: "https://first.example.org/mcp",
    });
    expect(loaded.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "package-capability-unsupported",
        target: "mcp:service",
      }),
    );
  });
});
