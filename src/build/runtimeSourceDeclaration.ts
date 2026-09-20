import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { readBoundedRuntimeFileSync } from "../shared/readBoundedRuntimeFile.ts";
import {
  runtimeDirectoryFiles,
  runtimeResourceIdentity,
  sourceAgentPluginFiles,
} from "../shared/runtimeResourceInventory.ts";

const sourceRoots = [
  "src/backend",
  "src/build",
  "src/host",
  "src/main",
  "src/server",
  "src/shared",
  "src/supervisor",
  "packages/agents-usage/src",
];
const configurationFiles = [
  "tsdown.config.ts",
  "tsconfig.json",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/prepare-agent-plugins.mjs",
  "scripts/server-native-overlay.mjs",
];
const MAX_RUNTIME_INPUT_BYTES = 8 * 1024 * 1024;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",")}}`;
}

export function readRuntimeSourceDeclaration(
  root: string,
  buildOptions: Readonly<Record<string, unknown>>,
) {
  const inputs = new Set<string>();
  const visit = (directory: string): void => {
    const directoryStat = lstatSync(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
      throw new Error(`Runtime input must be a real directory: ${directory}`);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        ["node_modules", "fixtures", "__fixtures__", "__tests__"].includes(entry.name) ||
        /(?:\.test\.|\.test$|testFixtures)/u.test(entry.name)
      )
        continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Runtime input cannot be a symbolic link: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        if (/\.(?:[cm]?tsx?|[cm]?js|json)$/u.test(entry.name)) inputs.add(resolve(path));
      } else throw new Error(`Runtime input is not a regular file: ${path}`);
    }
  };
  for (const path of sourceRoots) visit(join(root, path));
  for (const path of configurationFiles) {
    const absolute = resolve(root, path);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile())
      throw new Error(`Required runtime build input is missing: ${path}`);
    inputs.add(absolute);
  }
  const pluginFiles = sourceAgentPluginFiles(join(root, "src/supervisor/agents"));
  const bundledFiles = runtimeDirectoryFiles(join(root, "resources/plugins"));
  for (const file of [...pluginFiles, ...bundledFiles]) inputs.add(resolve(file.source));
  const files = [...inputs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const digest = createHash("sha256");
  digest.update(canonical(buildOptions) + "\n");
  for (const file of files) {
    const bytes = readBoundedRuntimeFileSync(file, MAX_RUNTIME_INPUT_BYTES);
    digest.update(
      JSON.stringify([
        relative(root, file).split(sep).join("/"),
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
      ]) + "\n",
    );
  }
  return {
    sourceHash: digest.digest("hex"),
    files,
    resources: [
      runtimeResourceIdentity("agent-plugins", pluginFiles),
      runtimeResourceIdentity("bundled-plugins", bundledFiles),
    ],
  };
}
