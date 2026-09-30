import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  discoverAgentPluginSources,
  resolveSharedForwardRuntime,
} from "./agentPluginAssetSources.ts";
import type { RuntimeResourceIdentity } from "./sshRuntimeManifest";
import { readBoundedRuntimeFileSync } from "./readBoundedRuntimeFile.ts";

const MAX_RESOURCE_FILES = 4096;
const MAX_RESOURCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 16 * 1024 * 1024;

export interface RuntimeResourceFile {
  readonly path: string;
  readonly source: string;
}

/** The source layout and packaged layout share the same logical asset names. */
export function sourceAgentPluginFiles(sourceAgentsDir: string): RuntimeResourceFile[] {
  const plugins = discoverAgentPluginSources(sourceAgentsDir);
  const shared = resolveSharedForwardRuntime(sourceAgentsDir);
  return [
    ...plugins.flatMap((plugin) =>
      plugin.assets.map((asset) => ({
        path: `${plugin.kind}/${asset}`,
        source: join(plugin.srcDir, asset),
      })),
    ),
    { path: shared.destRel.split(sep).join("/"), source: shared.src },
  ];
}

export function runtimeDirectoryFiles(root: string): RuntimeResourceFile[] {
  const files: RuntimeResourceFile[] = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > 64 || lstatSync(directory).isSymbolicLink())
      throw new Error("Runtime resource directory exceeds its inventory boundary.");
    for (const name of readdirSync(directory).sort()) {
      const source = join(directory, name);
      const stat = lstatSync(source);
      if (stat.isSymbolicLink())
        throw new Error("Runtime resource inventory cannot follow symbolic links.");
      if (stat.isDirectory()) visit(source, depth + 1);
      else if (stat.isFile()) {
        files.push({ path: relative(root, source).split(sep).join("/"), source });
        if (files.length > MAX_RESOURCE_FILES)
          throw new Error("Runtime resource inventory exceeds its file limit.");
      } else throw new Error("Runtime resource is not a regular file.");
    }
  };
  visit(root, 0);
  return files;
}

export function runtimeResourceIdentity(
  kind: RuntimeResourceIdentity["kind"],
  files: readonly RuntimeResourceFile[],
): RuntimeResourceIdentity {
  const digest = createHash("sha256");
  if (files.length > MAX_RESOURCE_FILES)
    throw new Error("Runtime resource inventory exceeds its file limit.");
  let total = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (lstatSync(file.source).isSymbolicLink())
      throw new Error("Runtime resource inventory cannot follow symbolic links.");
    const bytes = readBoundedRuntimeFileSync(
      file.source,
      Math.min(MAX_RESOURCE_FILE_BYTES, MAX_RESOURCE_BYTES - total),
    );
    total += bytes.length;
    digest.update(
      JSON.stringify([file.path, bytes.length, createHash("sha256").update(bytes).digest("hex")]) +
        "\n",
    );
  }
  return { kind, sha256: digest.digest("hex") };
}

export function verifyRuntimeResources(
  expected: readonly RuntimeResourceIdentity[],
  roots: {
    readonly agentPlugins: { readonly path: string; readonly layout: "source" | "staged" };
    readonly bundledPlugins: string;
  },
): void {
  for (const resource of expected) {
    const files =
      resource.kind === "agent-plugins"
        ? roots.agentPlugins.layout === "source"
          ? sourceAgentPluginFiles(roots.agentPlugins.path)
          : runtimeDirectoryFiles(roots.agentPlugins.path)
        : runtimeDirectoryFiles(roots.bundledPlugins);
    if (runtimeResourceIdentity(resource.kind, files).sha256 !== resource.sha256)
      throw new Error(
        `Runtime resource declaration differs: ${resource.kind}. Rebuild the runtime and its assets.`,
      );
  }
}
