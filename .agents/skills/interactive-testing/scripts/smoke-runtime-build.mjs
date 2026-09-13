import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { isBuiltin, createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { copyTree, linkBuildDependencies } from "./smoke-runtime-files.mjs";

const execute = promisify(execFile);

export async function buildSmokeRuntime({ repoRoot, appRoot, rendererViteHMR }) {
  await linkBuildDependencies(repoRoot, appRoot);
  const require = createRequire(join(repoRoot, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("tsdown")).href);
  const mainBundleDir = join(appRoot, "dist", "main");
  process.chdir(appRoot); // This helper runs in its own managed build process.
  const bundles = await build({
    cwd: appRoot,
    config: join(appRoot, "tsdown.config.ts"),
    outDir: mainBundleDir,
    watch: false,
    logLevel: "warn",
  });
  const packageManifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  const dependencies = new Set([
    "electron",
    ...smokeRuntimeDependencyRoots(packageManifest, bundles),
  ]);
  for (const bundle of bundles) await bundle[Symbol.asyncDispose]();
  for (const name of await readdir(mainBundleDir)) {
    if (!name.endsWith(".ssh-runtime-manifest.json")) continue;
    const manifest = JSON.parse(await readFile(join(mainBundleDir, name), "utf8"));
    for (const dependency of manifest.dependencies) dependencies.add(dependency);
  }
  if (!rendererViteHMR) {
    const { build: buildRenderer } = await import(pathToFileURL(require.resolve("vite")).href);
    await buildRenderer({
      root: appRoot,
      configFile: join(appRoot, "vite.config.ts"),
      mode: "development",
      logLevel: "warn",
      // Keep the deterministic CDP test bridge in this explicitly development
      // snapshot. It is not a production/release-artifact verification build.
      define: { "import.meta.env.DEV": "true", "import.meta.env.PROD": "false" },
      build: { outDir: join(appRoot, "dist", "renderer"), minify: false },
    });
  }
  await prepareResources(repoRoot, appRoot);
  return { dependencies: [...dependencies] };
}

export function smokeRuntimeDependencyRoots(packageManifest, bundles) {
  // createRequire-based lazy paths (diagnostics, updater and future adapters)
  // need the declared production closure even when bundle metadata cannot see them.
  const dependencies = new Set(Object.keys(packageManifest.dependencies ?? {}));
  const files = new Set(bundles.flatMap((bundle) => bundle.chunks.map((chunk) => chunk.fileName)));
  for (const bundle of bundles) {
    for (const chunk of bundle.chunks) {
      if (chunk.type !== "chunk") continue;
      for (const specifier of [...chunk.imports, ...chunk.dynamicImports]) {
        if (files.has(specifier)) continue;
        const name = packageName(specifier);
        if (name) dependencies.add(name);
      }
    }
  }
  return [...dependencies];
}

async function prepareResources(repoRoot, appRoot) {
  // Refresh generated resources against this source/build snapshot, never the checkout.
  for (const name of ["wsl-helpers"]) {
    try {
      await copyTree(join(repoRoot, "resources", name), join(appRoot, "resources", name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await mkdir(join(appRoot, "resources"), { recursive: true });
  const nativeBuildDir = join(appRoot, ".native-build");
  try {
    for (const [script, args] of [
      ["prepare-wsl-helpers.mjs", []],
      ["prepare-agent-plugins.mjs", []],
      ["prepare-computer-use-helper.mjs", ["--host-only", "--dev", "--force"]],
    ]) {
      const result = await execute(process.execPath, [join(appRoot, "scripts", script), ...args], {
        cwd: appRoot,
        env: { ...process.env, CARGO_TARGET_DIR: nativeBuildDir },
        maxBuffer: 8 * 1024 * 1024,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
  } finally {
    await rm(nativeBuildDir, { recursive: true, force: true });
  }
}

function packageName(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || isBuiltin(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
