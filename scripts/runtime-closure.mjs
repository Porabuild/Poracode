#!/usr/bin/env node
/**
 * Runtime closure for the standalone server artifact (E2/E3, V6 D.2, plan D3).
 *
 * One implementation of the packaging-side runtime contract, shared by the
 * tarball assembly and any consumer that needs the same closure:
 *
 * - `readRuntimeClosure` unions the `*.ssh-runtime-manifest.json` build
 *   declarations into the code files and runtime dependency set.
 * - `pinInstalledVersions` freezes the versions actually installed from the
 *   checkout lockfile (never a semver range that could select a different
 *   native wrapper later).
 * - `generateNpmShrinkwrap` freezes the transitive closure for the target
 *   install (`npm install` on a clean host resolves no live ranges).
 *
 * The SSH runtime bundle keeps its own delivery envelope; adopting this module
 * there is a deliberate follow-up, not a hidden behavior change.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Version of the packaging-side closure contract this module writes. */
export const RUNTIME_CLOSURE_FORMAT_VERSION = 1;

/**
 * Union of every `*.ssh-runtime-manifest.json` in the built bundle directory.
 * A missing closure is a loud failure: assembling a server without its runtime
 * declarations would ship a tarball that cannot install.
 */
export function readRuntimeClosure(mainBundleDir) {
  const files = new Map();
  const dependencies = new Set();
  const manifestFiles = [];
  for (const name of readdirSync(mainBundleDir)) {
    if (!name.endsWith(".ssh-runtime-manifest.json")) continue;
    const path = join(mainBundleDir, name);
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifestFiles.push(name);
    for (const file of manifest.files ?? []) files.set(file.path, file);
    for (const dependency of manifest.dependencies ?? []) dependencies.add(dependency);
  }
  if (manifestFiles.length === 0) {
    throw new Error(`No ssh-runtime manifests in ${mainBundleDir}. Build first (pnpm run build).`);
  }
  return {
    formatVersion: RUNTIME_CLOSURE_FORMAT_VERSION,
    files: [...files.values()],
    dependencies: [...dependencies].sort(),
    manifestFiles,
  };
}

/**
 * Freeze the installed version of every runtime dependency. Reads the version
 * from the packaging host's `node_modules` (the lockfile-resolved tree), not
 * from the root manifest's range.
 */
export function pinInstalledVersions(names, options) {
  const nodeModulesDir = options.nodeModulesDir;
  const rootPackage = options.rootPackage;
  const available = rootPackage.dependencies ?? {};
  return Object.fromEntries(
    names.map((name) => {
      const declared = available[name];
      if (typeof declared !== "string" || declared.length === 0) {
        throw new Error(`Missing pinned runtime dependency ${name} in package.json`);
      }
      const installedPath = join(nodeModulesDir, name, "package.json");
      if (!existsSync(installedPath)) {
        throw new Error(`Runtime dependency ${name} is not installed at ${installedPath}`);
      }
      const installed = JSON.parse(readFileSync(installedPath, "utf8"));
      if (
        typeof installed.version !== "string" ||
        !/^\d+\.\d+\.\d+(?:[-+].+)?$/u.test(installed.version)
      ) {
        throw new Error(`Invalid installed runtime version for ${name}`);
      }
      return [name, installed.version];
    }),
  );
}

/** The pinned runtime `package.json` the stage install consumes. */
export function buildStagePackageJson(input) {
  return {
    name: input.name ?? "poracode-server",
    version: input.version,
    private: true,
    engines: input.engines,
    dependencies: input.dependencies,
  };
}

export function writeStagePackageJson(stageDir, input) {
  const path = join(stageDir, "package.json");
  writeFileSync(path, `${JSON.stringify(buildStagePackageJson(input), null, 2)}\n`);
  return path;
}

/**
 * Resolve and freeze the transitive runtime closure as `npm-shrinkwrap.json`.
 * The lock is generated once on the packaging host (`--package-lock-only`,
 * scripts disabled, dev omitted) and renamed, so a target install resolves no
 * live ranges. npm includes optional platform dependencies for every OS/arch
 * in the lock, which is what lets one artifact cover several machine shapes.
 */
export function generateNpmShrinkwrap(stageDir, options = {}) {
  const npm = options.npm ?? "npm";
  const run = options.run ?? defaultRun;
  run(
    npm,
    [
      "install",
      "--package-lock-only",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    stageDir,
  );
  const lockPath = join(stageDir, "package-lock.json");
  if (!existsSync(lockPath)) {
    throw new Error(`npm did not write ${lockPath}; cannot freeze the runtime closure`);
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== "object") {
    throw new Error(`Unexpected package-lock shape (lockfileVersion ${lock.lockfileVersion})`);
  }
  const shrinkwrapPath = join(stageDir, "npm-shrinkwrap.json");
  renameSync(lockPath, shrinkwrapPath);
  return {
    shrinkwrapPath,
    lockfileVersion: lock.lockfileVersion,
    packageCount: Object.keys(lock.packages).length,
  };
}

function defaultRun(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "pipe" });
}

/** SHA-256 of one file, the integrity unit used across the artifact metadata. */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
