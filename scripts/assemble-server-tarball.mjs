#!/usr/bin/env node
/**
 * Assemble the published standalone-server tarball (docs/STANDALONE_SERVER.md §2.2).
 *
 * Copies the union of `*.ssh-runtime-manifest.json` files into `lib/`, layout
 * resources, the native overlay from `dist/server-native`, and a pinned
 * `package.json`. V6 D.2 ships the overlay inside the tarball so install can
 * apply it before `npm install` and skip node-gyp.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * V6 F.1 build-time assertion: the standalone server bundle must never import
 * Electron. Catches static and dynamic imports plus bare `require("electron")`
 * in any staged JavaScript file.
 */
const ELECTRON_IMPORT_PATTERN =
  /(?:from\s+["']electron(?:\/[^"']*)?["']|import\s+["']electron["']|import\s*\(\s*["']electron["']\s*\)|require\s*\(\s*["']electron["']\s*\)|require\s*\(\s*["']electron\/[^"']+["']\s*\))/u;

function assertNoElectronImport(path, bytes) {
  if (!/\.(?:js|cjs|mjs)$/u.test(path)) return;
  if (ELECTRON_IMPORT_PATTERN.test(bytes.toString("utf8"))) {
    throw new Error(
      `Server bundle file ${path} imports electron — the standalone host must stay Electron-free (V6 F.1).`,
    );
  }
}

function parseArgs(argv) {
  let outDir = join(repoRoot, "dist");
  let mainBundleDir = join(repoRoot, "dist", "main");
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out-dir") {
      outDir = resolve(argv[++index]);
    } else if (argument === "--main-bundle-dir") {
      mainBundleDir = resolve(argv[++index]);
    }
  }
  return { outDir, mainBundleDir };
}

function readUnionManifests(mainBundleDir) {
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
    files: [...files.values()],
    dependencies: [...dependencies].sort(),
    manifestFiles,
  };
}

function pinDependencies(names, rootPackage) {
  const available = rootPackage.dependencies ?? {};
  return Object.fromEntries(
    names.map((name) => {
      const version = available[name];
      if (typeof version !== "string" || version.length === 0) {
        throw new Error(`Missing pinned runtime dependency ${name} in package.json`);
      }
      // Publish the version installed from the checkout lockfile, not a
      // semver range that could select a different native wrapper later.
      const installed = JSON.parse(
        readFileSync(join(repoRoot, "node_modules", name, "package.json"), "utf8"),
      );
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

function copyResourceDir(stageResources, name, required) {
  const source = join(repoRoot, "resources", name);
  if (!existsSync(source)) {
    if (required) throw new Error(`Required resource directory missing: ${source}`);
    return;
  }
  cpSync(source, join(stageResources, name), { recursive: true });
}

export function assembleServerTarball(options = {}) {
  const mainBundleDir = options.mainBundleDir ?? join(repoRoot, "dist", "main");
  const outDir = options.outDir ?? join(repoRoot, "dist");
  const overlaySource = options.overlaySource ?? join(repoRoot, "dist", "server-native");
  if (!existsSync(overlaySource)) {
    throw new Error(
      `native-overlay missing at ${overlaySource}. Run \`pnpm run prepare:server-native\` before assembling the tarball.`,
    );
  }
  const { files, dependencies, manifestFiles } = readUnionManifests(mainBundleDir);
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const stage = join(outDir, "poracode-server-stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources"), { recursive: true });

  for (const file of files) {
    const source = join(mainBundleDir, file.path);
    const bytes = readFileSync(source);
    assertNoElectronImport(file.path, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (file.sha256 && sha !== file.sha256) {
      throw new Error(`Hash mismatch for ${file.path}`);
    }
    const destination = join(stage, "lib", file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  for (const name of manifestFiles) {
    cpSync(join(mainBundleDir, name), join(stage, "lib", name));
  }

  copyResourceDir(join(stage, "resources"), "wsl-helpers", true);
  copyResourceDir(join(stage, "resources"), "skills", false);
  copyResourceDir(join(stage, "resources"), "plugins", false);
  copyResourceDir(join(stage, "resources"), "agent-plugins", true);
  copyResourceDir(join(stage, "resources"), "computer-use-helper", true);

  cpSync(overlaySource, join(stage, "native-overlay"), { recursive: true });
  mkdirSync(join(stage, "scripts"), { recursive: true });
  cpSync(
    join(repoRoot, "scripts", "server-native-overlay.mjs"),
    join(stage, "scripts", "server-native-overlay.mjs"),
  );
  cpSync(join(repoRoot, "packaging", "Dockerfile"), join(stage, "Dockerfile"));

  const extra = ["node-pty", "better-sqlite3"].filter((name) => !dependencies.includes(name));
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: "poracode-server",
        version: rootPackage.version,
        private: true,
        engines: rootPackage.engines,
        dependencies: pinDependencies([...dependencies, ...extra], rootPackage),
      },
      null,
      2,
    )}\n`,
  );

  mkdirSync(outDir, { recursive: true });
  const tarballName = `poracode-server-${rootPackage.version}-${process.platform}-${process.arch}.tar.gz`;
  const tarballPath = join(outDir, tarballName);
  execFileSync("tar", ["-czf", tarballPath, "-C", stage, "."], { stdio: "pipe" });
  const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  writeFileSync(join(outDir, `${tarballName}.sha256`), `${sha256}  ${tarballName}\n`);
  return { tarballPath, sha256, stageDir: stage };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { outDir, mainBundleDir } = parseArgs(process.argv.slice(2));
  const result = assembleServerTarball({ outDir, mainBundleDir });
  process.stdout.write(`${result.tarballPath}\n${result.sha256}\n`);
}
