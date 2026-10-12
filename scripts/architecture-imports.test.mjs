import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import {
  auditBoundaries,
  buildImportGraph,
  buildInventory,
  collectBuildEntries,
  createResolver,
  expandGlob,
  findConsumers,
  findElectronChains,
  scanSourceReferences,
} from "./architecture-imports.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix = "poracode-arch-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

function fixtureGraph(files) {
  const root = writeFixture(tempDir(), files);
  return { root, graph: buildImportGraph({ rootDir: root, followFile: true }) };
}

function findEdge(graph, from, to) {
  return graph.edges.find((edge) => edge.from === from && edge.to === to);
}

void test("scan classifies every module reference kind without regex matching", () => {
  const references = scanSourceReferences(
    [
      'import { A } from "static-runtime";',
      'import type { B } from "static-type";',
      'import { type C, D } from "mixed-names";',
      'import { type E } from "all-type-names";',
      'import type from "default-named-type";',
      'import "side-effect";',
      'export * from "export-star";',
      'export type { F } from "export-type";',
      'export { G, type H } from "export-mixed";',
      'const a = await import("dynamic");',
      'const b: import("import-query").I = c;',
      'import q = require("import-equals");',
      'const r = require("require-call");',
      'const u = new URL("./asset.ts", import.meta.url);',
      'const w = new Worker(new URL("./worker.ts", import.meta.url));',
      'const m = import.meta.glob("./*/manifest.ts");',
      'vi.mock("@/mocked");',
    ].join("\n"),
    "fixture.ts",
  );
  const bySpecifier = new Map(references.map((reference) => [reference.specifier, reference]));
  assert.equal(bySpecifier.get("static-runtime").kind, "static");
  assert.equal(bySpecifier.get("static-runtime").typeOnly, false);
  assert.equal(bySpecifier.get("static-type").typeOnly, true);
  assert.equal(bySpecifier.get("mixed-names").typeOnly, false);
  assert.equal(bySpecifier.get("all-type-names").typeOnly, true);
  assert.equal(bySpecifier.get("default-named-type").typeOnly, false);
  assert.equal(bySpecifier.get("side-effect").kind, "side-effect");
  assert.equal(bySpecifier.get("export-star").kind, "export-from");
  assert.equal(bySpecifier.get("export-star").typeOnly, false);
  assert.equal(bySpecifier.get("export-type").typeOnly, true);
  assert.equal(bySpecifier.get("export-mixed").typeOnly, false);
  assert.equal(bySpecifier.get("import-equals").kind, "import-equals");
  assert.equal(bySpecifier.get("require-call").kind, "require");
  assert.equal(bySpecifier.get("import-query").kind, "dynamic");
  assert.equal(bySpecifier.get("import-query").typeOnly, null);
  assert.equal(bySpecifier.get("./asset.ts").kind, "url-asset");
  assert.equal(bySpecifier.get("./asset.ts").worker, false);
  assert.equal(bySpecifier.get("./worker.ts").worker, true);
  assert.equal(bySpecifier.get("./*/manifest.ts").kind, "glob");
  assert.equal(bySpecifier.get("@/mocked").kind, "test-mock");
  assert.equal(bySpecifier.get("dynamic").typeOnly, null);
});

void test("scanner ignores member calls, method signatures, regex bodies and template text", () => {
  const references = scanSourceReferences(
    [
      "const a = skills.import(payload);",
      "class S { async import(input: Payload): Promise<Result> { return input as Result; } }",
      String.raw`const regex = /import\("fake"\)|require\("fake2"\)/;`,
      'const template = `text require("fake3") import("fake4")`;',
      'import { real } from "real-module";',
    ].join("\n"),
    "fixture.ts",
  );
  assert.deepEqual(
    references.map((reference) => reference.specifier),
    ["real-module"],
  );
});

void test("type-erasure evidence separates import type queries from runtime dynamic imports", () => {
  const { graph } = fixtureGraph({
    "src/host/runtime.ts": 'export const value = await import("@/host/target");\n',
    "src/host/query.ts":
      'export type Query = import("@/host/target").Target;\nexport type Also = typeof import("@/host/target");\n',
    "src/host/target.ts": "export interface Target { x: number }\n",
  });
  assert.equal(findEdge(graph, "src/host/runtime.ts", "src/host/target.ts").typeOnly, false);
  assert.equal(findEdge(graph, "src/host/query.ts", "src/host/target.ts").typeOnly, true);
});

void test("resolver handles alias, extensions, barrels, workspace and builtins", () => {
  const root = writeFixture(tempDir(), {
    "src/host/db.ts": "export const db = 1;\n",
    "src/host/db/connection.ts": "export const connection = 1;\n",
    "src/host/db/index.ts": 'export * from "./connection";\n',
    "src/host/data.json": '{"ok":true}\n',
    "src/host/importer.ts": "",
  });
  const resolver = createResolver({ rootDir: root });
  const from = join(root, "src/host/importer.ts");
  assert.equal(resolver.resolve("@/host/db", from).path, join(root, "src/host/db.ts"));
  assert.equal(
    resolver.resolve("@/host/db/connection", from).path,
    join(root, "src/host/db/connection.ts"),
  );
  assert.equal(resolver.resolve("./db", from).path, join(root, "src/host/db.ts"));
  assert.equal(resolver.resolve("./data.json", from).path, join(root, "src/host/data.json"));
  assert.equal(resolver.resolve("node:fs", from).kind, "builtin");
  assert.equal(resolver.resolve("electron", from).kind, "external");
  assert.equal(resolver.resolve("./missing", from).reason, "unresolved-relative");
});

void test("resolver maps .js specifiers onto .ts sources", () => {
  const root = writeFixture(tempDir(), {
    "src/host/mod.ts": "export const mod = 1;\n",
    "src/host/importer.ts": "",
  });
  const resolver = createResolver({ rootDir: root });
  const resolved = resolver.resolve("./mod.js", join(root, "src/host/importer.ts"));
  assert.equal(resolved.kind, "file");
  assert.equal(resolved.path, join(root, "src/host/mod.ts"));
});

void test("forbidden electron edge is a hard violation with a file:line chain", () => {
  const { graph } = fixtureGraph({
    "src/host/bad.ts": 'import { app } from "electron";\nexport const a = app;\n',
  });
  const audit = auditBoundaries(graph);
  assert.equal(audit.hardViolations, 1);
  const violation = audit.violations[0];
  assert.equal(violation.severity, "violation");
  assert.equal(violation.from, "src/host/bad.ts");
  assert.equal(violation.line, 1);
  assert.equal(violation.chain[0].to, "external:electron");
});

void test("type-only electron and src/main imports stay allowed", () => {
  const { graph } = fixtureGraph({
    "src/host/typed.ts":
      'import type { WebContents } from "electron";\nimport type { MainThing } from "@/main/thing";\nexport type Both = [WebContents, MainThing];\n',
    "src/main/thing.ts": "export interface MainThing { x: number }\n",
  });
  const audit = auditBoundaries(graph);
  assert.equal(audit.violations.length, 0);
  assert.equal(findEdge(graph, "src/host/typed.ts", "external:electron").typeOnly, true);
  assert.equal(findEdge(graph, "src/host/typed.ts", "src/main/thing.ts").typeOnly, true);
});

void test("lazy import of electron from a shared root is a hard violation", () => {
  const { graph } = fixtureGraph({
    "src/host/lazy.ts": 'export async function load() {\n  return await import("electron");\n}\n',
  });
  const audit = auditBoundaries(graph);
  assert.equal(audit.hardViolations, 1);
  assert.equal(audit.violations[0].line, 2);
});

void test("worker URL entries and their electron dependency are reported", () => {
  const { graph } = fixtureGraph({
    "src/host/entry.ts":
      'export const worker = new Worker(new URL("./worker.ts", import.meta.url));\n',
    "src/host/worker.ts": 'import { ipcMain } from "electron";\nexport const x = ipcMain;\n',
  });
  const urlEdge = findEdge(graph, "src/host/entry.ts", "src/host/worker.ts");
  assert.equal(urlEdge.kind, "url-asset");
  assert.equal(urlEdge.occurrences[0].worker, true);
  const audit = auditBoundaries(graph);
  assert.equal(audit.hardViolations, 1);
  assert.equal(audit.violations[0].from, "src/host/worker.ts");
});

void test("transitive host -> main implementation -> electron yields a chain", () => {
  const { graph } = fixtureGraph({
    "src/backend/consumer.ts": 'import { z } from "@/main/impl";\nexport const v = z;\n',
    "src/main/impl.ts": 'import { app } from "electron";\nexport const z = app;\n',
  });
  const audit = auditBoundaries(graph);
  const migration = audit.violations.find((entry) => entry.from === "src/backend/consumer.ts");
  assert.equal(migration.severity, "migration");
  assert.equal(migration.targetClass, "implementation");
  const chains = findElectronChains(graph, ["src/backend/consumer.ts"]);
  assert.equal(chains.length, 1);
  assert.deepEqual(
    chains[0].path.map((hop) => hop.to),
    ["src/main/impl.ts", "external:electron"],
  );
});

void test("compatibility re-exports are classified apart from real implementation ownership", () => {
  const { graph } = fixtureGraph({
    "src/main/db.ts": 'export * from "@/host/db";\n',
    "src/host/db.ts": "export const db = 1;\n",
    "src/backend/uses-barrel.ts": 'import { db } from "@/main/db";\nexport const v = db;\n',
    "src/backend/uses-impl.ts": 'import { v } from "@/main/thing";\nexport const w = v;\n',
    "src/main/thing.ts": "export const v = 1;\n",
  });
  assert.equal(graph.nodes.get("src/main/db.ts").compatibilityReexport, true);
  assert.equal(graph.nodes.get("src/main/db.ts").barrel, true);
  assert.equal(graph.nodes.get("src/main/thing.ts").barrel, false);
  const audit = auditBoundaries(graph);
  const barrelEdge = audit.violations.find((entry) => entry.from === "src/backend/uses-barrel.ts");
  assert.equal(barrelEdge.severity, "compat-reexport");
  assert.equal(barrelEdge.finalOwner, "src/host/db.ts");
  assert.deepEqual(
    barrelEdge.chain.map((hop) => hop.to),
    ["src/main/db.ts", "src/host/db.ts"],
  );
  const implEdge = audit.violations.find((entry) => entry.from === "src/backend/uses-impl.ts");
  assert.equal(implEdge.severity, "migration");
  assert.equal(implEdge.targetClass, "implementation");
});

void test("computed specifiers are unresolved dynamic ambiguity, never proof of absence", () => {
  const { graph } = fixtureGraph({
    "src/host/dynamic.ts": 'const name = "target";\nexport const mod = await import(name);\n',
    "src/host/only-computed-target.ts": "export const orphan = 1;\n",
  });
  const computed = graph.unresolved.filter((entry) => entry.reason === "computed-specifier");
  assert.equal(computed.length, 1);
  assert.equal(computed[0].from, "src/host/dynamic.ts");
  assert.equal(computed[0].ambiguous, true);
  assert.equal(computed[0].specifier, undefined);
  const inventory = buildInventory(graph);
  const orphan = inventory.deletionCandidates.find(
    (entry) => entry.module === "src/host/only-computed-target.ts",
  );
  if (orphan) {
    assert.equal(orphan.requiresManualConfirmation, true);
    assert.match(orphan.note, /not proof of absence/u);
    assert.equal(orphan.evidence.dynamicAmbiguityPresent, true);
  }
});

void test("consumers list includes runtime, type-only and mocked test references", () => {
  const { graph } = fixtureGraph({
    "src/host/service.ts": "export const service = 1;\n",
    "src/backend/consumer.ts":
      'import { service } from "@/host/service";\nexport const v = service;\n',
    "src/backend/typed.ts":
      'import type { Service } from "@/host/service";\nexport type S = Service;\n',
    "src/backend/consumer.test.ts":
      'vi.mock("@/host/service", () => ({}));\nimport "@/host/service";\n',
  });
  const consumers = findConsumers(graph, "src/host/service.ts");
  assert.deepEqual(
    consumers.map((consumer) => `${consumer.from}:${consumer.typeOnly}:${consumer.kind}`),
    [
      "src/backend/consumer.test.ts:false:test-mock",
      "src/backend/consumer.test.ts:false:side-effect",
      "src/backend/consumer.ts:false:static",
      "src/backend/typed.ts:true:static",
    ],
  );
  const mocked = consumers.find((consumer) => consumer.kind === "test-mock");
  assert.equal(mocked.from, "src/backend/consumer.test.ts");
  assert.equal(mocked.test, true);
});

void test("glob registries expand to concrete files and keep non-relative globs unresolved", () => {
  const { graph } = fixtureGraph({
    "src/renderer/registry.ts":
      'const modules = import.meta.glob("./*/manifest.ts");\nconst icons = import.meta.glob("~icons/*.svg");\nexport const m = modules;\n',
    "src/renderer/alpha/manifest.ts": "export const manifest = 1;\n",
    "src/renderer/beta/manifest.ts": "export const manifest = 2;\n",
  });
  assert.ok(findEdge(graph, "src/renderer/registry.ts", "src/renderer/alpha/manifest.ts"));
  assert.ok(findEdge(graph, "src/renderer/registry.ts", "src/renderer/beta/manifest.ts"));
  const nonRelative = graph.unresolved.find((entry) => entry.reason === "glob-non-relative");
  assert.equal(nonRelative.ambiguous, true);
});

void test("collectBuildEntries reads tsdown entries, runtime declarations and manifest names", () => {
  const root = writeFixture(tempDir(), {
    "tsdown.config.ts": [
      "import { defineConfig } from 'tsdown';",
      "export default defineConfig([",
      "  { entry: { main: 'src/main/main.ts' }, plugins: [runtimeDeclaration('src/main/main.ts')] },",
      "  { entry: { server: 'src/server/cli.ts' }, plugins: [runtimeDeclaration('src/server/cli.ts', 'server')] },",
      "  { entry: { wslStagingWorker: 'src/supervisor/wsl/staging/worker.ts' } },",
      "]);",
    ].join("\n"),
    "src/shared/sshRuntimeManifest.ts":
      "export const SSH_RUNTIME_ENTRY_CONFIG = { server: [], supervisor: ['a'] } as const;\n",
  });
  const entries = collectBuildEntries(root);
  assert.deepEqual(
    entries.entries.map((entry) => entry.path),
    ["src/main/main.ts", "src/server/cli.ts", "src/supervisor/wsl/staging/worker.ts"],
  );
  assert.equal(entries.entries.find((entry) => entry.name === "wslStagingWorker").kind, "worker");
  assert.deepEqual(entries.manifestEntries, [
    { entryPath: "src/main/main.ts", manifestEntry: undefined },
    { entryPath: "src/server/cli.ts", manifestEntry: "server" },
  ]);
  assert.deepEqual(entries.manifestNames, ["server", "supervisor"]);
});

void test("expandGlob matches directories with a glob segment", () => {
  const root = writeFixture(tempDir(), {
    "providers/alpha/manifest.ts": "",
    "providers/beta/manifest.ts": "",
    "providers/gamma/other.ts": "",
  });
  const matches = expandGlob(join(root, "providers/*/manifest.ts"));
  assert.deepEqual(
    matches.map((path) => path.replace(`${root}/`, "")),
    ["providers/alpha/manifest.ts", "providers/beta/manifest.ts"],
  );
});

void test("real repository resolves the E1 tooling inputs structurally", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const entries = collectBuildEntries(repoRoot);
  assert.ok(
    entries.entries.length >= 16,
    `expected >=16 tsdown entries, got ${entries.entries.length}`,
  );
  assert.ok(entries.manifestNames.includes("supervisor"));
  assert.ok(entries.manifestNames.includes("server"));
  const resolver = createResolver({ rootDir: repoRoot });
  const resolved = resolver.resolve(
    "@/host/supervisor/SupervisorClient",
    join(repoRoot, "src/backend/BackendHostCore.ts"),
  );
  assert.equal(resolved.kind, "file");
  assert.equal(resolved.path, join(repoRoot, "src/host/supervisor/SupervisorClient.ts"));
});

void test("public analyzer API and constant contract survive the support-module split", async () => {
  const analyzerApi = await import("./architecture-imports.mjs");
  const functions = [
    "auditBoundaries",
    "buildImportGraph",
    "buildInventory",
    "classifyNodeOwnership",
    "collectBuildEntries",
    "collectConfigRoots",
    "collectDeployReferences",
    "collectNativeReferences",
    "collectPluginRoots",
    "collectTestEntryReferences",
    "collectToolRoots",
    "computeReachability",
    "createResolver",
    "discoverSourceFiles",
    "expandGlob",
    "findConsumers",
    "findElectronChains",
    "isFixturePath",
    "isGeneratedPath",
    "isTestFile",
    "main",
    "renderInventoryMarkdown",
    "rootOfFile",
    "scanSourceReferences",
    "tokenizeSource",
  ];
  for (const name of functions) {
    assert.equal(typeof analyzerApi[name], "function", `${name} must stay exported as a function`);
  }
  assert.equal(analyzerApi.ARCHITECTURE_GRAPH_FORMAT_VERSION, 1);
  assert.equal(analyzerApi.ARCHITECTURE_INVENTORY_FORMAT_VERSION, 1);
  assert.deepEqual(analyzerApi.NON_MAIN_ROOTS, analyzerApi.SHARED_BACKEND_ROOTS);
  assert.ok(Object.isFrozen(analyzerApi.SHARED_BACKEND_ROOTS));
  assert.ok(Object.isFrozen(analyzerApi.DEFAULT_BOUNDARY_RULES));
  assert.ok(Object.isFrozen(analyzerApi.MOVE_BATCHES));
  assert.ok(
    analyzerApi.DEFAULT_BOUNDARY_RULES.some((rule) => rule.id === "electron-runtime-outside-main"),
  );
  assert.ok(
    analyzerApi.DEFAULT_BOUNDARY_RULES.some((rule) => rule.id === "shared-backend-to-main"),
  );
});

void test("literal source paths to process entry points are reference roots, not dead files", () => {
  const { graph } = fixtureGraph({
    "src/backend/register.mjs": "export const registered = true;\n",
    "src/backend/consumer.test.ts":
      'import { resolve } from "node:path";\nconst entry = resolve("src/backend/register.mjs");\nexport const e = entry;\n',
  });
  const inventory = buildInventory(graph);
  assert.deepEqual(
    inventory.roots.reference.map((entry) => `${entry.source} -> ${entry.path}`),
    ["src/backend/consumer.test.ts -> src/backend/register.mjs"],
  );
  assert.equal(
    inventory.deletionCandidates.find((entry) => entry.module === "src/backend/register.mjs"),
    undefined,
  );
});
