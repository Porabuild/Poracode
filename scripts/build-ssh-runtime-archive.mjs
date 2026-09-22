#!/usr/bin/env node
/**
 * Build the immutable preassembled SSH runtime archive the desktop ships
 * (`resources/ssh-runtime-archive/{manifest.json,<archive>}`), consumed by
 * `src/host/ssh/runtimeArchive.ts`.
 *
 * This is release packaging, not a second installer or dependency resolver:
 * it stages the same runtime closure the server tarball ships
 * (`readRuntimeClosure`), pins the versions actually installed
 * (`pinInstalledVersions`), freezes the transitive install
 * (`generateNpmShrinkwrap`) and hashes/tars the staged tree with the exact
 * algorithm the runtime loader uses (`hashRuntimeDirectory`). A development
 * checkout stages the bundle on the worker with semver ranges; this archive is
 * what makes the release closure frozen.
 *
 * Usage:
 *   node scripts/build-ssh-runtime-archive.mjs [--main-bundle-dir dist/main] \
 *     [--agent-plugins-dir resources/agent-plugins] [--wsl-helpers-dir resources/wsl-helpers] \
 *     [--skills-dir resources/skills] [--plugins-dir resources/plugins] \
 *     [--out resources/ssh-runtime-archive]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateNpmShrinkwrap,
  pinInstalledVersions,
  readRuntimeClosure,
  sha256File,
  writeStagePackageJson,
} from "./runtime-closure.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Matches `SSH_RUNTIME_ARCHIVE_MANIFEST_VERSION` in src/host/ssh/runtimeArchive.ts. */
export const SSH_RUNTIME_ARCHIVE_FORMAT_VERSION = 1;
const MAX_ARCHIVE_DEPTH = 64;

/**
 * Mirror of `runtimeDirectoryFiles`/`hashRuntimeDirectory` from
 * `src/host/ssh/runtimeBundleFiles.ts` (sorted per-directory traversal,
 * posix-relative paths, `path\0bytes\0`). A parity test pins the two
 * implementations together; the loader cannot recompute this hash, so the
 * packaging side must be the one that matches.
 */
export function runtimeDirectoryFiles(root) {
  const files = [];
  const visit = (directory, depth) => {
    if (depth > MAX_ARCHIVE_DEPTH || lstatSync(directory).isSymbolicLink())
      throw new Error("Runtime archive directory exceeds its inventory boundary.");
    for (const name of readdirSync(directory).sort()) {
      const source = join(directory, name);
      const stat = lstatSync(source);
      if (stat.isSymbolicLink()) throw new Error("Runtime archive cannot follow symbolic links.");
      if (stat.isDirectory()) visit(source, depth + 1);
      else if (stat.isFile())
        files.push({ path: relative(root, source).split(sep).join("/"), source });
      else throw new Error("Runtime archive member is not a regular file.");
    }
  };
  visit(root, 0);
  return files;
}

export function hashRuntimeDirectory(root) {
  const hash = createHash("sha256");
  for (const file of runtimeDirectoryFiles(root)) {
    hash.update(file.path).update("\0");
    hash.update(readFileSync(file.source)).update("\0");
  }
  return hash.digest("hex");
}

function readSourceHash(mainBundleDir) {
  const hashes = new Set();
  for (const name of readdirSync(mainBundleDir)) {
    if (!name.endsWith(".ssh-runtime-manifest.json")) continue;
    const manifest = JSON.parse(readFileSync(join(mainBundleDir, name), "utf8"));
    if (typeof manifest.sourceHash === "string") hashes.add(manifest.sourceHash);
  }
  if (hashes.size !== 1) {
    throw new Error(
      `SSH runtime manifests must agree on one sourceHash (found ${hashes.size}); build first.`,
    );
  }
  return [...hashes][0];
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--main-bundle-dir") options.mainBundleDir = resolve(argv[++index]);
    else if (argument === "--agent-plugins-dir") options.agentPluginsDir = resolve(argv[++index]);
    else if (argument === "--wsl-helpers-dir") options.wslHelpersDir = resolve(argv[++index]);
    else if (argument === "--skills-dir") options.skillsDir = resolve(argv[++index]);
    else if (argument === "--plugins-dir") options.pluginsDir = resolve(argv[++index]);
    else if (argument === "--out") options.outDir = resolve(argv[++index]);
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function buildSshRuntimeArchive(options = {}) {
  const mainBundleDir = options.mainBundleDir ?? join(repoRoot, "dist", "main");
  const agentPluginsDir = options.agentPluginsDir ?? join(repoRoot, "resources", "agent-plugins");
  const wslHelpersDir = options.wslHelpersDir ?? join(repoRoot, "resources", "wsl-helpers");
  const skillsDir = options.skillsDir ?? join(repoRoot, "resources", "skills");
  const pluginsDir = options.pluginsDir ?? join(repoRoot, "resources", "plugins");
  const outDir = options.outDir ?? join(repoRoot, "resources", "ssh-runtime-archive");
  const rootPackage =
    options.rootPackage ?? JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const nodeModulesDir = options.nodeModulesDir ?? join(repoRoot, "node_modules");

  const closure = readRuntimeClosure(mainBundleDir);
  const sourceHash = readSourceHash(mainBundleDir);
  const extra = ["node-pty", "better-sqlite3"].filter(
    (name) => !closure.dependencies.includes(name),
  );
  const dependencies = pinInstalledVersions([...closure.dependencies, ...extra], {
    rootPackage,
    nodeModulesDir,
  });

  rmSync(outDir, { recursive: true, force: true });
  const stage = join(outDir, ".stage");
  mkdirSync(stage, { recursive: true });
  try {
    for (const file of closure.files) {
      const source = join(mainBundleDir, file.path);
      const bytes = readFileSync(source);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (file.sha256 && sha !== file.sha256) throw new Error(`Hash mismatch for ${file.path}`);
      const destination = join(stage, file.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    for (const name of closure.manifestFiles) {
      cpSync(join(mainBundleDir, name), join(stage, name));
    }
    const resources = [
      ["agent-plugins", agentPluginsDir, true],
      ["wsl-helpers", wslHelpersDir, true],
      ["skills", skillsDir, false],
      ["plugins", pluginsDir, false],
    ];
    for (const [name, sourceDir, required] of resources) {
      if (!existsSync(sourceDir)) {
        if (required) throw new Error(`Required SSH runtime resource is missing: ${sourceDir}`);
        continue;
      }
      cpSync(sourceDir, join(stage, name), { recursive: true });
    }

    writeStagePackageJson(stage, {
      name: "poracode-ssh-runtime",
      version: rootPackage.version,
      engines: rootPackage.engines,
      dependencies,
    });
    if (options.shrinkwrap !== false) {
      generateNpmShrinkwrap(stage, options.npmRun ? { run: options.npmRun } : {});
    }

    const hash = hashRuntimeDirectory(stage);
    const archiveName = `ssh-runtime-${hash}.tar.gz`;
    const archivePath = join(outDir, archiveName);
    // Relative archive name + cwd: GNU tar on Windows reads a `C:\…` `-f`
    // argument as an rsh `host:file` spec; bsdtar treats both the same.
    execFileSync("tar", ["-czf", archiveName, "-C", stage, "."], {
      stdio: "pipe",
      cwd: outDir,
    });
    const manifest = {
      formatVersion: SSH_RUNTIME_ARCHIVE_FORMAT_VERSION,
      archive: archiveName,
      hash,
      archiveSha256: sha256File(archivePath),
      sourceHash,
    };
    const manifestPath = join(outDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { manifestPath, archivePath, ...manifest };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const result = buildSshRuntimeArchive(parseArgs(process.argv.slice(2)));
    process.stdout.write(
      `${JSON.stringify({
        manifestPath: result.manifestPath,
        archivePath: result.archivePath,
        hash: result.hash,
        archiveSha256: result.archiveSha256,
        sourceHash: result.sourceHash,
      })}\n`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
