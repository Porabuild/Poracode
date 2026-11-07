// Guards the dev server's startup cost. Each check pins a cause that once made
// `bun run dev` take over a minute to first render, so a regression fails here
// with the cause named instead of showing up as a slow dev loop. Budgets keep
// roughly 50% headroom over the measured values; raise one only when the growth
// is intended, and say why in the commit.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
// Measured 5.2k: src, packages, resources, build, public and root files.
const MAX_WATCHED_ENTRIES = 8_000;
// Directories whose contents Vite may watch (vite.config.ts CLIENT_WATCH_ROOTS).
const WATCHED_ROOTS = new Set(["src", "packages", "build", "resources", "public"]);
// Measured 1,383 modules for the four warmup entries.
const MAX_STARTUP_MODULES = 2_000;
// Packages app code may import without pre-bundling. Anything else belongs in
// CLIENT_OPTIMIZED_DEPS: an unbundled package loads as one request per file
// (rehype-katex and two others were ~57). Each entry here is deliberate.
const RAW_IMPORT_PACKAGES = new Set([
  // Per-language and per-theme modules imported on demand.
  "shiki",
  "@shikijs/langs",
  "@shikijs/themes",
  // The lazy editor and its workers, separate ESM files by design.
  "monaco-editor",
  // Single-file ESM builds or data imported once.
  "marked",
  "jsqr",
  "material-icon-theme",
  "@expo/hub-client",
]);
// Measured ~4 s warm on a 16-thread desktop. A backstop for regressions the
// structural checks miss, not a target.
const MAX_WARMUP_MS = 45_000;

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const OPTIMIZED_DEP_RE = /[\\/]node_modules[\\/]\.vite[\\/]deps[\\/]/;
// The innermost node_modules segment, so Bun's `.bun/<pkg>/node_modules/` layout
// resolves to the package itself.
const PACKAGE_NAME_RE = /.*[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/;

let server;
let warmupMs;
let startupModuleCount = 0;
let reachableModules = [];

async function waitForWarmup(graph, started) {
  // Warmup has no completion event: wait until the transformed set is stable.
  let transformed = 0;
  let stableSince = performance.now();
  while (performance.now() - stableSince < 2_000) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    let count = 0;
    for (const module of graph.idToModuleMap.values()) if (module.transformResult) count++;
    if (count !== transformed) {
      transformed = count;
      stableSince = performance.now();
    }
    if (performance.now() - started > MAX_WARMUP_MS + 10_000) break;
  }
  return { transformed, finishedMs: stableSince - started };
}

// Transform what warmup leaves out: dynamic-import targets, which deferred
// features load during a normal session.
async function crawlDynamicImports(environment) {
  const crawled = new Set();
  for (;;) {
    const pending = [...environment.moduleGraph.idToModuleMap.values()].filter(
      (module) => !module.transformResult && !crawled.has(module.url),
    );
    if (pending.length === 0) return;
    await Promise.all(
      pending.map(async (module) => {
        crawled.add(module.url);
        // A module that fails to transform is not this guard's concern.
        await environment.transformRequest(module.url).catch(() => null);
      }),
    );
  }
}

test.before(async () => {
  process.chdir(root);
  const started = performance.now();
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "warn" });
  await server.listen();
  const environment = server.environments.client;
  const warmup = await waitForWarmup(environment.moduleGraph, started);
  warmupMs = warmup.finishedMs;
  startupModuleCount = warmup.transformed;
  await crawlDynamicImports(environment);
  reachableModules = [...environment.moduleGraph.idToModuleMap.values()];
});

test.after(async () => {
  await server?.close();
});

await test("watches only the client source roots", () => {
  const entries = [];
  for (const [dir, names] of Object.entries(server.watcher.getWatched())) {
    for (const name of names) {
      const path = relative(root, resolve(dir, name));
      if (path && !path.startsWith("..")) entries.push(path);
    }
  }
  // A root-level entry (index.html, a config, a directory name) is fine; the
  // contents of anything outside the client roots (worktrees, Android and iOS
  // build output, dist, caches) are what made the watcher scan take ~45 s.
  const outside = entries.filter(
    (path) => path.includes(sep) && !WATCHED_ROOTS.has(path.split(sep)[0]),
  );
  assert.deepEqual(outside.slice(0, 10), [], "Vite watches files outside the client source roots");
  assert.ok(
    entries.length <= MAX_WATCHED_ENTRIES,
    `Vite watches ${entries.length} paths (budget ${MAX_WATCHED_ENTRIES}); each is a native fs.watch on the server's main thread`,
  );
});

await test("warms up the startup graph from entries that exist", () => {
  const clientFiles = server.config.server.warmup.clientFiles ?? [];
  assert.ok(clientFiles.length > 0, "server.warmup.clientFiles is empty");
  for (const file of clientFiles) {
    assert.ok(existsSync(resolve(root, file)), `warmup entry ${file} does not exist`);
  }
  assert.ok(
    startupModuleCount > 500,
    `warmup transformed only ${startupModuleCount} modules; the startup graph is not being warmed`,
  );
  assert.ok(
    startupModuleCount <= MAX_STARTUP_MODULES,
    `the startup graph has ${startupModuleCount} modules (budget ${MAX_STARTUP_MODULES}); load the new ones lazily or raise the budget on purpose`,
  );
});

await test("serves the dependencies app code imports pre-bundled", () => {
  const unbundled = new Set();
  for (const module of reachableModules) {
    const id = module.id ?? "";
    if (!NODE_MODULES_RE.test(id) || OPTIMIZED_DEP_RE.test(id) || /\.css(?:$|\?)/.test(id))
      continue;
    // A raw package's own imports follow from allowing it; check app imports.
    const importedByApp = [...module.importers].some(
      (importer) => !NODE_MODULES_RE.test(importer.id ?? ""),
    );
    const name = PACKAGE_NAME_RE.exec(id)?.[1].replace("\\", "/");
    if (importedByApp && name && !RAW_IMPORT_PACKAGES.has(name)) unbundled.add(name);
  }
  assert.deepEqual(
    [...unbundled],
    [],
    "app code imports these packages unbundled (one request per file); add them to CLIENT_OPTIMIZED_DEPS in vite.config.ts",
  );
});

await test("keeps Babel off the dev server's main thread", () => {
  const names = server.config.plugins.map((plugin) => plugin.name);
  assert.ok(
    !names.includes("@rolldown/plugin-babel"),
    "a Babel plugin runs on the dev server's main thread; route Lingui macros through poracode:lingui-macro-workers",
  );
  assert.ok(names.includes("poracode:lingui-macro-workers"));
});

await test("warms up within the startup budget", (t) => {
  // Logged on every run so drift is visible long before a budget trips.
  t.diagnostic(
    `warmup ${Math.round(warmupMs)} ms, startup graph ${startupModuleCount} modules, reachable ${reachableModules.length}`,
  );
  assert.ok(
    warmupMs <= MAX_WARMUP_MS,
    `warmup took ${Math.round(warmupMs)} ms (budget ${MAX_WARMUP_MS} ms)`,
  );
});
