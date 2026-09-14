import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  assertWithin,
  copyRuntimeDependencies,
  copyTree,
  hashTree,
} from "./smoke-runtime-files.mjs";

const execute = promisify(execFile);
const SOURCE_PATHS = [
  "src",
  "packages",
  "resources",
  "build",
  "native/computer-use-helper",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsdown.config.ts",
  "tsconfig.json",
  "vite.config.ts",
  "lingui.config.ts",
  "postcss.config.mjs",
  "index.html",
  "public",
  ".agents/skills/interactive-testing",
];

/** Snapshot source and build into a fresh session root; checkout rebuilds cannot change lazy children. */
export async function prepareSmokeRuntime({
  repoRoot,
  root,
  build,
  ownerToken = randomUUID(),
  rendererViteHMR = false,
}) {
  const appRoot = join(root, "runtime");
  const mainBundleDir = join(appRoot, "dist", "main");
  await mkdir(root, { recursive: true });
  await mkdir(appRoot); // Reusing an old runtime would mix revisions or remove another owner's build.
  try {
    await writeFile(join(appRoot, ".smoke-owner"), ownerToken);
    const source = await snapshotSource(repoRoot, appRoot);
    const buildRuntime = build ?? (await import("./smoke-runtime-build.mjs")).buildSmokeRuntime;
    const { dependencies } = await buildRuntime({ repoRoot, appRoot, rendererViteHMR });
    await rm(join(appRoot, "node_modules"), { recursive: true, force: true });
    const native = await copyRuntimeDependencies(repoRoot, appRoot, dependencies);
    if (dependencies.includes("electron")) await validateSmokeNativeDependencies(appRoot);
    const manifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
    await writeFile(
      join(appRoot, "package.json"),
      `${JSON.stringify(
        {
          name: manifest.name,
          version: manifest.version,
          type: "module",
          main: "dist/main/main.cjs",
        },
        null,
        2,
      )}\n`,
    );
    const artifact = await hashTree(appRoot);
    const runtime = {
      formatVersion: 1,
      ownerToken,
      appRoot,
      mainBundleDir,
      resourcesDir: join(appRoot, "resources"),
      nodeModulesDir: native.nodeModulesDir,
      source,
      artifact,
      packages: native.packages,
      renderer: rendererViteHMR ? "vite-hmr-development" : "frozen-development-build",
    };
    await writeFile(join(root, "runtime-manifest.json"), `${JSON.stringify(runtime, null, 2)}\n`);
    return runtime;
  } catch (error) {
    await rm(appRoot, { recursive: true, force: true });
    throw error;
  }
}

async function sourceFiles(repoRoot) {
  const { stdout: listed } = await execute(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...SOURCE_PATHS],
    { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  return new Set(listed.split("\0").filter(Boolean));
}

async function snapshotSource(repoRoot, appRoot) {
  const files = await sourceFiles(repoRoot);
  for (const name of [...files].sort()) {
    const source = join(repoRoot, name);
    const target = join(appRoot, name);
    assertWithin(repoRoot, source);
    assertWithin(appRoot, target);
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyTree(source, target);
    } catch (error) {
      // A tracked deletion belongs to the dirty source snapshot too.
      if (error.code !== "ENOENT") throw error;
    }
  }
  const [{ stdout: sha }, { stdout: status }, fingerprint] = await Promise.all([
    execute("git", ["rev-parse", "HEAD"], { cwd: repoRoot }),
    execute("git", ["status", "--porcelain=v1", "--", ...SOURCE_PATHS], { cwd: repoRoot }),
    hashTree(appRoot, new Set(), files),
  ]);
  return { revision: sha.trim(), dirty: status.length > 0, ...fingerprint };
}

export async function verifyReusableSmokeRuntime(
  runtime,
  { root, repoRoot, rendererViteHMR = false },
) {
  const renderer = rendererViteHMR ? "vite-hmr-development" : "frozen-development-build";
  if (runtime?.renderer !== renderer)
    throw new Error(
      "Active session renderer mode differs from this launch; stop it or use --new with a fresh root.",
    );
  const currentSource = await hashTree(repoRoot, new Set(), await sourceFiles(repoRoot));
  if (runtime.source?.sha256 !== currentSource.sha256)
    throw new Error(
      "Checkout source changed since this session was built; stop it or use --new with a fresh root. Explicit --session inspection remains available for the old baseline.",
    );
  return verifySmokeRuntime(runtime, root);
}

export async function validateSmokeNativeDependencies(appRoot) {
  const validationEnv = smokeRuntimeEnvironment(process.env);
  // Unit-test installs can skip Electron; launching an isolated app requires it.
  delete validationEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
  const result = await execute(
    process.execPath,
    [join(appRoot, "scripts", "ensure-native-deps.mjs"), "--electron-native"],
    {
      cwd: appRoot,
      env: validationEnv,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

export async function verifySmokeRuntime(runtime, root) {
  if (
    !runtime ||
    runtime.formatVersion !== 1 ||
    resolve(runtime.appRoot) !== resolve(root, "runtime")
  ) {
    throw new Error(
      "Managed session does not identify an isolated runtime; stop it and launch a new session.",
    );
  }
  const current = await hashTree(runtime.appRoot);
  if (current.sha256 !== runtime.artifact.sha256)
    throw new Error(
      "Managed runtime artifacts changed after preparation; restart the session before recording evidence.",
    );
  return current;
}

export function smokeElectronLaunch(runtime, userDataDir, env) {
  const require = createRequire(join(runtime.appRoot, "package.json"));
  const electronRoot = dirname(require.resolve("electron/package.json"));
  const electronPath = join(
    electronRoot,
    "dist",
    readFileSync(join(electronRoot, "path.txt"), "utf8").trim(),
  );
  assertWithin(realpathSync(runtime.appRoot), realpathSync(electronPath));
  return {
    command: electronPath,
    args: [`--user-data-dir=${userDataDir}`, runtime.appRoot],
    options: {
      cwd: runtime.appRoot,
      env: smokeRuntimeEnvironment(env),
      detached: process.platform !== "win32",
      windowsHide: process.platform === "win32",
      stdio: "inherit",
    },
  };
}

export function smokeRuntimeEnvironment(env) {
  const cleanEnv = { ...env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  delete cleanEnv.ELECTRON_OVERRIDE_DIST_PATH;
  delete cleanEnv.NODE_PATH;
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  delete cleanEnv.PORACODE_COMPUTER_USE_HELPER_PATH;
  delete cleanEnv.PORACODE_BUNDLED_PLUGINS_DIR;
  delete cleanEnv.PORACODE_WSL_HELPERS_DIR;
  delete cleanEnv.PORACODE_WSL_WATCHER_DIR;
  for (const key of Object.keys(cleanEnv)) {
    if (/^PORACODE_.+_PLUGIN_SOURCE$/.test(key)) delete cleanEnv[key];
  }
  return cleanEnv;
}

export async function removeSmokeRuntime(runtime, root) {
  if (!runtime || resolve(runtime.appRoot) !== resolve(root, "runtime"))
    throw new Error("Refusing to remove a runtime outside its owning session.");
  let owner;
  try {
    owner = await readFile(join(runtime.appRoot, ".smoke-owner"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (owner !== runtime.ownerToken)
    throw new Error("Refusing to remove a runtime owned by another session.");
  await rm(runtime.appRoot, { recursive: true, force: true });
}
