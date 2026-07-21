import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverAgentPluginSources,
  resolveSharedForwardRuntime,
  stageAgentPlugins,
} from "../../../../scripts/prepare-agent-plugins.mjs";

const EXPECTED_PLUGIN_KINDS = [
  "claude",
  "codex",
  "commandcode",
  "copilot",
  "cursor",
  "gemini",
  "grok",
  "opencode",
  "qoder",
] as const;

const repoRoot = resolve(import.meta.dirname, "../../../..");
const agentsDir = join(repoRoot, "src", "supervisor", "agents");
const tempDirs: string[] = [];

function sourcePluginKinds(): string[] {
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(agentsDir, entry.name, "plugin", "plugin.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent plugin asset discovery", () => {
  it("discovers every provider plugin source exactly once", () => {
    const sources = discoverAgentPluginSources(agentsDir);
    const kinds = sources.map((source) => source.kind);

    expect(sourcePluginKinds()).toEqual(EXPECTED_PLUGIN_KINDS);
    expect(kinds).toEqual(EXPECTED_PLUGIN_KINDS);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("selects forward.mjs for forwarders and OpenCode's in-process asset", () => {
    const sources = discoverAgentPluginSources(agentsDir);
    const byKind = new Map(sources.map((source) => [source.kind, source.assets]));

    expect(byKind.get("opencode")).toEqual(["plugin.json", "poracode-status.mjs"]);
    for (const source of sources) {
      if (source.kind === "opencode") continue;
      expect(source.assets).toEqual(["plugin.json", "forward.mjs"]);
    }
  });

  it("requires the shared forward runtime at its packaged destination", () => {
    const runtime = resolveSharedForwardRuntime(agentsDir);

    expect(runtime.src).toBe(
      join(agentsDir, "plugin", "forward-runtime", "poracode-hook-runtime.mjs"),
    );
    expect(existsSync(runtime.src)).toBe(true);
    expect(runtime.destRel).toBe(join("_runtime", "poracode-hook-runtime.mjs"));
  });

  it("rejects provider plugins without exactly one supported runtime asset", () => {
    const sourceAgentsDir = mkdtempSync(join(tmpdir(), "poracode-agent-sources-"));
    tempDirs.push(sourceAgentsDir);
    const pluginDir = join(sourceAgentsDir, "example", "plugin");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "plugin.json"), "{}\n");

    expect(() => discoverAgentPluginSources(sourceAgentsDir)).toThrow(
      "example must provide exactly one runtime asset",
    );

    writeFileSync(join(pluginDir, "forward.mjs"), "export {};\n");
    writeFileSync(join(pluginDir, "poracode-status.mjs"), "export {};\n");
    expect(() => discoverAgentPluginSources(sourceAgentsDir)).toThrow(
      "example must provide exactly one runtime asset",
    );
  });

  it("fails before staging when the shared forward runtime is absent", () => {
    const sourceAgentsDir = mkdtempSync(join(tmpdir(), "poracode-agent-sources-"));
    tempDirs.push(sourceAgentsDir);

    expect(() => resolveSharedForwardRuntime(sourceAgentsDir)).toThrow(
      "missing shared runtime source",
    );
  });

  it("stages byte-identical provider assets and the shared runtime", () => {
    const destinationBase = mkdtempSync(join(tmpdir(), "poracode-agent-plugins-"));
    tempDirs.push(destinationBase);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      stageAgentPlugins({ sourceAgentsDir: agentsDir, destinationBase });
    } finally {
      logSpy.mockRestore();
    }

    for (const source of discoverAgentPluginSources(agentsDir)) {
      for (const asset of source.assets) {
        expect(readFileSync(join(destinationBase, source.kind, asset))).toEqual(
          readFileSync(join(source.srcDir, asset)),
        );
      }
    }

    const runtime = resolveSharedForwardRuntime(agentsDir);
    expect(readFileSync(join(destinationBase, runtime.destRel))).toEqual(readFileSync(runtime.src));
  });
});
