/**
 * Command line entry points for the architecture analyzer.
 *
 * audit / consumers / graph / inventory argument parsing, graph loading and
 * output writing. The executable entry remains scripts/architecture-imports.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { toPosix } from "./paths.mjs";
import { buildImportGraph } from "./graph.mjs";
import { auditBoundaries } from "./audit.mjs";
import { buildInventory, findConsumers } from "./inventory.mjs";
import { renderInventoryMarkdown } from "./report.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const [key, inline] = token.slice(2).split("=");
      if (inline !== undefined) args[key] = inline;
      else if (argv[index + 1] && !argv[index + 1].startsWith("--")) args[key] = argv[++index];
      else args[key] = true;
    } else {
      args._.push(token);
    }
  }
  return args;
}

function rootFromArgs(args) {
  return resolve(args.root && args.root !== true ? args.root : process.cwd());
}

function loadGraph(rootDir) {
  return buildImportGraph({ rootDir, followFile: true });
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runAudit(args) {
  const graph = loadGraph(rootFromArgs(args));
  const audit = auditBoundaries(graph);
  if (args.json) {
    printJson({ stats: graph.stats, ...audit });
  } else {
    process.stdout.write(
      `architecture audit: ${graph.stats.files} files, ${graph.stats.edges} edges, ` +
        `${audit.violations.length} findings ` +
        `(hard ${audit.hardViolations}, migration ${audit.migrationEdges}, compat-reexport ${audit.compatReexportEdges})\n`,
    );
    for (const violation of audit.violations) {
      process.stdout.write(
        `${violation.severity}\t${violation.from}:${violation.line ?? "?"}\t${violation.specifier ?? ""}\t` +
          `${violation.targetClass}\t${violation.chain.map((hop) => hop.to).join(" -> ")}\n`,
      );
    }
    const computed = graph.unresolved.filter((entry) => entry.reason === "computed-specifier");
    process.stdout.write(
      `unresolved computed specifiers: ${computed.length} (dynamic ambiguity is not absence of use)\n`,
    );
  }
  // Enforcement is the report itself: every finding is a boundary violation
  // until the ownership moves and import-path cleanups land. There is no
  // allowlist and no suppression flag.
  return audit.violations.length > 0 ? 1 : 0;
}

function runConsumers(args) {
  const graph = loadGraph(rootFromArgs(args));
  const moduleId = args._[1];
  if (!moduleId) throw new Error("usage: architecture-imports.mjs consumers <module path>");
  const normalized = toPosix(moduleId).replace(/^\.\//u, "");
  const consumers = findConsumers(graph, normalized);
  if (args.json) printJson({ module: normalized, consumers });
  else {
    process.stdout.write(`${consumers.length} consumers of ${normalized}\n`);
    for (const consumer of consumers) {
      process.stdout.write(
        `${consumer.from}:${consumer.line}\t${consumer.typeOnly ? "type" : "runtime"}\t${consumer.kind}\n`,
      );
    }
  }
  return 0;
}

function runInventory(args) {
  const rootDir = rootFromArgs(args);
  const outDir = resolve(
    rootDir,
    args["out-dir"] && args["out-dir"] !== true ? args["out-dir"] : "tmp/v2-production",
  );
  const graph = loadGraph(rootDir);
  const inventory = buildInventory(graph);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "e1-e3-inventory.json");
  const markdownPath = join(outDir, "e1-e3-inventory.md");
  writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(markdownPath, renderInventoryMarkdown(inventory));
  process.stdout.write(
    `wrote ${toPosix(relative(rootDir, jsonPath))} and ${toPosix(relative(rootDir, markdownPath))}\n`,
  );
  process.stdout.write(
    `files ${inventory.graph.files}, edges ${inventory.graph.edges}, ` +
      `findings ${inventory.audit.violations.length}, deletion candidates ${inventory.deletionCandidates.length}\n`,
  );
  return 0;
}

function runGraph(args) {
  const rootDir = rootFromArgs(args);
  const graph = loadGraph(rootDir);
  const summary = {
    formatVersion: graph.formatVersion,
    rootDir: graph.rootDir,
    stats: graph.stats,
    unresolved: graph.unresolved.length,
    warnings: graph.warnings.length,
  };
  if (args.out && args.out !== true) {
    writeFileSync(
      resolve(rootDir, args.out),
      `${JSON.stringify(
        {
          ...summary,
          nodes: [...graph.nodes.values()].map((node) => ({
            id: node.id,
            root: node.root,
            isTest: node.isTest,
            barrel: node.barrel,
            compatibilityReexport: node.compatibilityReexport,
            reexportTargets: node.reexportTargets,
          })),
          edges: graph.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
            typeOnly: edge.typeOnly,
            kind: edge.kind,
            specifier: edge.specifier,
            occurrences: edge.occurrences,
          })),
          unresolved: graph.unresolved,
          warnings: graph.warnings,
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`wrote ${args.out}\n`);
  } else {
    printJson(summary);
  }
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] ?? "audit";
  if (command === "audit") return runAudit(args);
  if (command === "consumers") return runConsumers(args);
  if (command === "inventory") return runInventory(args);
  if (command === "graph") return runGraph(args);
  throw new Error(`unknown command: ${command}`);
}
