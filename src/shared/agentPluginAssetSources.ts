import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROVIDER_RUNTIME_ASSETS = ["forward.mjs", "poracode-status.mjs"];

export interface AgentPluginSource {
  kind: string;
  assets: readonly string[];
  srcDir: string;
}

/** Shared by staging and build/runtime resource qualification; providers opt in
 * beside their implementation through a plugin manifest, without a vendor list. */
export function discoverAgentPluginSources(sourceAgentsDir: string): AgentPluginSource[] {
  return readdirSync(sourceAgentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ kind: entry.name, srcDir: join(sourceAgentsDir, entry.name, "plugin") }))
    .filter(({ srcDir }) => existsSync(join(srcDir, "plugin.json")))
    .map(({ kind, srcDir }) => {
      const runtimeAssets = PROVIDER_RUNTIME_ASSETS.filter((asset) =>
        existsSync(join(srcDir, asset)),
      );
      if (runtimeAssets.length !== 1)
        throw new Error(
          `[prepare-agent-plugins] ${kind} must provide exactly one runtime asset (${PROVIDER_RUNTIME_ASSETS.join(" or ")}): ${srcDir}`,
        );
      return { kind, assets: ["plugin.json", runtimeAssets[0]!], srcDir };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

export function resolveSharedForwardRuntime(sourceAgentsDir: string): {
  src: string;
  destRel: string;
} {
  const runtime = {
    src: join(sourceAgentsDir, "plugin", "forward-runtime", "poracode-hook-runtime.mjs"),
    destRel: join("_runtime", "poracode-hook-runtime.mjs"),
  };
  if (!existsSync(runtime.src))
    throw new Error(`[prepare-agent-plugins] missing shared runtime source: ${runtime.src}`);
  return runtime;
}
