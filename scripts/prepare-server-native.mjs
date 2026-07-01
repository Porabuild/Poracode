import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, delimiter, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const betterSqliteRoot = dirname(require.resolve("better-sqlite3/package.json"));
const stageRoot = resolve(repoRoot, "dist", "server-native", "build", "better-sqlite3");
const outputDir = resolve(repoRoot, "dist", "server-native");
const outputFile = join(outputDir, "better_sqlite3.node");
const nodeGypBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(dirname(stageRoot), { recursive: true });
cpSync(betterSqliteRoot, stageRoot, {
  recursive: true,
  filter: (source) => {
    const rel = relative(betterSqliteRoot, source);
    return rel === "" || !rel.split(/[\\/]/).includes("build");
  },
});

run(nodeGypBin, ["rebuild", "--release"], {
  cwd: stageRoot,
  env: {
    ...process.env,
    npm_config_runtime: "node",
    npm_config_target: process.versions.node,
    PATH: `${join(repoRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  },
});

const builtBinding = join(stageRoot, "build", "Release", "better_sqlite3.node");
if (!existsSync(builtBinding)) {
  throw new Error(`better-sqlite3 build did not produce ${builtBinding}`);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(builtBinding, outputFile);
console.log(`[lightcode-server] prepared Node-ABI better-sqlite3 binding: ${outputFile}`);
console.log("[lightcode-server] headless server will use it automatically from this repo.");
