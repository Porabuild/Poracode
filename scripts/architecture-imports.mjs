#!/usr/bin/env node
/**
 * Architecture import graph, boundary audit and reachability inventory (V2 plan E1/E3).
 *
 * The graph is built from real compiler primitives that already ship in this repo:
 *
 * - The TypeScript scanner (`typescript/unstable/ast` `createScanner`) tokenizes
 *   every source file, including TypeScript-only syntax, JSX and decorators. Module
 *   references are found by token patterns, never by regex over raw text.
 * - esbuild (`transformSync`) provides the type-erasure evidence that separates
 *   runtime module edges from type-only ones: a literal `import("...")` that is
 *   erased from the transform output is a type query, not a runtime dependency.
 *   Static `import type` clauses are classified directly from the tokens.
 *   This extends the existing acorn tokenizer approach in `runtime-externals.mjs`
 *   from bundled output to source files.
 *
 * The tool answers three questions with evidence:
 *
 * 1. `audit` — which runtime dependency edges violate the E1 boundary
 *    (Electron from non-main roots, `src/main` from shared/server roots),
 *    with the exact file:line chain and a classification of the target
 *    (compatibility re-export vs genuine implementation vs desktop-only).
 * 2. `consumers <module>` — who imports a module, for bounded move batches.
 * 3. `inventory` — reachability from build/tool/test/native roots plus possible
 *    deletions with evidence. Nothing is ever declared dead from a missing direct
 *    import: computed specifiers are reported as unresolved dynamic ambiguity and
 *    never treated as proof of absence.
 *
 * There is no per-file allowlist. Rules are declared by owner root; current
 * violations are reported truthfully until the ownership moves land.
 *
 * Usage:
 *   node scripts/architecture-imports.mjs audit [--root <dir>] [--json]
 *   node scripts/architecture-imports.mjs consumers <module path> [--root <dir>]
 *   node scripts/architecture-imports.mjs graph [--root <dir>] [--out <file>]
 *   node scripts/architecture-imports.mjs inventory [--root <dir>] [--out-dir <dir>]
 *
 * The implementation is split into cohesive support modules under
 * `scripts/architecture-imports/`; this file preserves the public API and CLI.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { main } from "./architecture-imports/cli.mjs";

export {
  isFixturePath,
  isGeneratedPath,
  isTestFile,
  rootOfFile,
} from "./architecture-imports/paths.mjs";
export { scanSourceReferences, tokenizeSource } from "./architecture-imports/scanner.mjs";
export {
  createResolver,
  discoverSourceFiles,
  expandGlob,
} from "./architecture-imports/resolver.mjs";
export {
  ARCHITECTURE_GRAPH_FORMAT_VERSION,
  buildImportGraph,
} from "./architecture-imports/graph.mjs";
export {
  collectBuildEntries,
  collectConfigRoots,
  collectDeployReferences,
  collectNativeReferences,
  collectPluginRoots,
  collectTestEntryReferences,
  collectToolRoots,
} from "./architecture-imports/roots.mjs";
export {
  auditBoundaries,
  DEFAULT_BOUNDARY_RULES,
  findElectronChains,
  NON_MAIN_ROOTS,
  SHARED_BACKEND_ROOTS,
} from "./architecture-imports/audit.mjs";
export {
  ARCHITECTURE_INVENTORY_FORMAT_VERSION,
  buildInventory,
  classifyNodeOwnership,
  computeReachability,
  findConsumers,
  MOVE_BATCHES,
} from "./architecture-imports/inventory.mjs";
export { renderInventoryMarkdown } from "./architecture-imports/report.mjs";
export { main };

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
