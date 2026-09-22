/**
 * Reachability, ownership classification and deletion/move inventory.
 *
 * Computes reachability from every root category, classifies module ownership
 * (implementation vs barrel vs compatibility re-export), expands the declared move
 * batches and lists possible deletions with their evidence. Nothing is declared
 * dead from a missing direct import: computed specifiers stay ambiguous.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONFIG_FILE_PATTERN,
  DATA_OR_BINDING_PATTERN,
  NON_CANDIDATE_ROOT_PATTERN,
  toPosix,
  uniqueSorted,
} from "./paths.mjs";
import { auditBoundaries, findElectronChains } from "./audit.mjs";
import {
  collectBuildEntries,
  collectConfigRoots,
  collectDeployReferences,
  collectNativeReferences,
  collectPluginRoots,
  collectTestEntryReferences,
  collectToolRoots,
} from "./roots.mjs";

export const ARCHITECTURE_INVENTORY_FORMAT_VERSION = 1;

/* ------------------------------------------------------------------------------------------------
 * Reachability and inventory
 * ---------------------------------------------------------------------------------------------- */

function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const edge of graph.edges) {
    if (edge.typeOnly) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  return adjacency;
}

export function computeReachability(graph, rootsByCategory) {
  const adjacency = buildAdjacency(graph);
  const reachable = new Map();
  for (const [category, roots] of Object.entries(rootsByCategory)) {
    const queue = [...roots];
    const seen = new Set();
    while (queue.length > 0) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = reachable.get(id) ?? new Set();
      entry.add(category);
      reachable.set(id, entry);
      for (const next of adjacency.get(id) ?? []) queue.push(next);
    }
  }
  return reachable;
}

export function classifyNodeOwnership(graph) {
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    const out = outgoing.get(edge.from) ?? [];
    out.push(edge);
    outgoing.set(edge.from, out);
    const incomingList = incoming.get(edge.to) ?? [];
    incomingList.push(edge);
    incoming.set(edge.to, incomingList);
  }
  const ownership = [];
  for (const node of graph.nodes.values()) {
    const inbound = incoming.get(node.id) ?? [];
    const outbound = outgoing.get(node.id) ?? [];
    ownership.push({
      module: node.id,
      root: node.root,
      kind: node.compatibilityReexport
        ? "compatibility-reexport"
        : node.barrel
          ? "barrel"
          : node.isDeclaration
            ? "declaration"
            : "implementation",
      finalOwner: node.compatibilityReexport ? node.reexportTargets[0] : node.id,
      inboundRuntime: uniqueSorted(
        inbound.filter((edge) => !edge.typeOnly).map((edge) => edge.from),
      ),
      inboundTypeOnly: uniqueSorted(
        inbound.filter((edge) => edge.typeOnly).map((edge) => edge.from),
      ),
      outboundRuntime: uniqueSorted(
        outbound.filter((edge) => !edge.typeOnly).map((edge) => edge.to),
      ),
      outboundToMain: uniqueSorted(
        outbound
          .filter((edge) => !edge.typeOnly && edge.to.startsWith("src/main/"))
          .map((edge) => edge.to),
      ),
      reexportTargets: node.reexportTargets,
    });
  }
  return ownership;
}

export function findConsumers(graph, moduleId) {
  const normalized = toPosix(moduleId).replace(/^\.\//u, "");
  const consumers = [];
  for (const candidateEdge of graph.edges.filter((edge) => edge.to === normalized)) {
    for (const occurrence of candidateEdge.occurrences) {
      consumers.push({
        from: candidateEdge.from,
        line: occurrence.line,
        specifier: candidateEdge.specifier,
        kind: occurrence.kind ?? candidateEdge.kind,
        typeOnly: candidateEdge.typeOnly,
        test: graph.nodes.get(candidateEdge.from)?.isTest === true,
        worker: occurrence.worker === true,
      });
    }
  }
  return consumers.sort((left, right) => {
    if (left.from !== right.from) return left.from.localeCompare(right.from);
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

// All declared ownership moves are complete. Keep the public inventory field
// for future reviewed moves; completed batches belong in the execution log.
export const MOVE_BATCHES = Object.freeze([]);

/**
 * Reclassify a relative specifier that points at a build-generated artifact by
 * finding the tool script that emits it (evidence, not an allowlist).
 */
function annotateGeneratedArtifacts(unresolved, rootDir) {
  const toolScripts = collectToolRoots(rootDir).filter((root) => root.path.startsWith("scripts/"));
  const cache = new Map();
  return unresolved.map((entry) => {
    if (entry.reason !== "unresolved-relative" || !entry.specifier) return entry;
    const basename = entry.specifier.split("/").pop() ?? "";
    if (!/\.[cm]?[jt]s$|\.node$/u.test(basename)) return entry;
    let generator = cache.get(basename);
    if (generator === undefined) {
      generator = null;
      for (const script of toolScripts) {
        try {
          if (readFileSync(resolve(rootDir, script.path), "utf8").includes(basename)) {
            generator = script.path;
            break;
          }
        } catch {
          /* ignored */
        }
      }
      cache.set(basename, generator);
    }
    return generator
      ? { ...entry, reason: "build-generated-artifact", generatedBy: generator }
      : entry;
  });
}

export function buildInventory(graph) {
  const entries = collectBuildEntries(graph.rootDir);
  const toolRoots = collectToolRoots(graph.rootDir);
  const configRoots = collectConfigRoots(graph.rootDir);
  const nativeReferences = collectNativeReferences(graph.rootDir);
  const pluginRoots = collectPluginRoots(graph.rootDir);
  const deployReferences = collectDeployReferences(graph.rootDir);

  const buildRootIds = uniqueSorted([
    ...entries.entries.map((entry) => entry.path),
    ...entries.manifestEntries.map((entry) => entry.entryPath),
  ]).filter((id) => graph.nodes.has(id));
  const toolRootIds = uniqueSorted([
    ...toolRoots.map((root) => root.path),
    ...configRoots.map((root) => root.path),
  ]).filter((id) => graph.nodes.has(id));
  const pluginRootIds = uniqueSorted(pluginRoots.map((root) => root.path)).filter((id) =>
    graph.nodes.has(id),
  );
  const deployRootIds = uniqueSorted(deployReferences.map((root) => root.path)).filter((id) =>
    graph.nodes.has(id),
  );
  const testRootIds = [...graph.nodes.values()]
    .filter((node) => node.isTest)
    .map((node) => node.id);
  const packageRootIds = [...graph.nodes.values()]
    .filter((node) => node.root.startsWith("packages/") && !node.isTest)
    .map((node) => node.id);
  const testEntryReferences = collectTestEntryReferences(graph.rootDir, testRootIds);
  const referenceRootIds = uniqueSorted(testEntryReferences.map((entry) => entry.path)).filter(
    (id) => graph.nodes.has(id),
  );

  const reachability = computeReachability(graph, {
    build: buildRootIds,
    tool: toolRootIds,
    plugin: pluginRootIds,
    deploy: deployRootIds,
    reference: referenceRootIds,
    test: testRootIds,
    package: packageRootIds,
  });

  const audit = auditBoundaries(graph);
  const ownership = classifyNodeOwnership(graph);
  const ownershipByModule = new Map(ownership.map((entry) => [entry.module, entry]));

  const inboundAny = new Map();
  for (const edge of graph.edges) {
    const list = inboundAny.get(edge.to) ?? {
      runtime: new Set(),
      type: new Set(),
      test: new Set(),
    };
    if (edge.typeOnly) list.type.add(edge.from);
    else list.runtime.add(edge.from);
    if (graph.nodes.get(edge.from)?.isTest) list.test.add(edge.from);
    inboundAny.set(edge.to, list);
  }

  const dynamicAmbiguity = graph.unresolved.some((entry) => entry.ambiguous === true);

  const deletionCandidates = [];
  for (const node of graph.nodes.values()) {
    if (
      node.isTest ||
      node.isDeclaration ||
      node.generated ||
      node.fixture ||
      node.root === "src/renderer" ||
      node.root === "tests" ||
      NON_CANDIDATE_ROOT_PATTERN.test(node.id) ||
      CONFIG_FILE_PATTERN.test(node.id) ||
      DATA_OR_BINDING_PATTERN.test(node.id)
    ) {
      continue;
    }
    const inbound = inboundAny.get(node.id);
    const inboundRuntime = inbound ? uniqueSorted(inbound.runtime) : [];
    const inboundTypeOnly = inbound ? uniqueSorted(inbound.type) : [];
    const nonTestRuntime = inboundRuntime.filter((id) => graph.nodes.get(id)?.isTest !== true);
    const nonTestTypeOnly = inboundTypeOnly.filter((id) => graph.nodes.get(id)?.isTest !== true);
    const categories = reachability.get(node.id) ?? new Set();
    const runtimeCategories = [...categories].filter((category) => category !== "test");
    if (
      nonTestRuntime.length === 0 &&
      nonTestTypeOnly.length === 0 &&
      runtimeCategories.length === 0
    ) {
      const testOnly = inboundRuntime.length > 0 || inboundTypeOnly.length > 0;
      deletionCandidates.push({
        module: node.id,
        status: "possible-deletion",
        requiresManualConfirmation: true,
        confidence: testOnly ? "test-only-consumer" : "no-static-consumer-observed",
        evidence: {
          inboundRuntime,
          inboundTypeOnly,
          inboundTests: inbound ? uniqueSorted(inbound.test) : [],
          reachableFrom: uniqueSorted([...categories]),
          testConsumersOnly: testOnly,
          dynamicAmbiguityPresent: dynamicAmbiguity,
        },
        replacement: ownershipByModule.get(node.id)?.finalOwner,
        note: testOnly
          ? "Only test consumers reference this file; review it together with those tests."
          : dynamicAmbiguity
            ? "No non-test static consumer; computed specifiers exist elsewhere in the graph, so this is not proof of absence."
            : "No static runtime or type consumer and no build/tool/plugin/deploy root reaches it.",
      });
    }
  }
  deletionCandidates.sort((left, right) => left.module.localeCompare(right.module));

  const unusedCompatibilityReexports = ownership.filter(
    (entry) =>
      entry.kind === "compatibility-reexport" &&
      (inboundAny.get(entry.module)?.runtime.size ?? 0) === 0,
  );

  const moveBatches = MOVE_BATCHES.map((batch) => {
    const batchIds = new Set(
      [...graph.nodes.values()]
        .filter(
          (node) =>
            batch.modules.some((module) =>
              module.endsWith("/") ? node.id.startsWith(module) : node.id === module,
            ) || (batch.companionModules ?? []).includes(node.id),
        )
        .map((node) => node.id),
    );
    const modules = [];
    for (const node of graph.nodes.values()) {
      if (!batchIds.has(node.id) || node.isTest) continue;
      const inbound = inboundAny.get(node.id) ?? {
        runtime: new Set(),
        type: new Set(),
        test: new Set(),
      };
      const outboundToMain = ownershipByModule.get(node.id)?.outboundToMain ?? [];
      const classify = (target) => {
        const targetOwnership = ownershipByModule.get(target);
        if (targetOwnership?.kind === "compatibility-reexport") return "compatibility-reexport";
        if (batchIds.has(target)) return "intra-batch";
        return "main-dependency";
      };
      modules.push({
        module: node.id,
        consumers: uniqueSorted(inbound.runtime),
        typeConsumers: uniqueSorted(inbound.type),
        testConsumers: uniqueSorted(inbound.test),
        compatibilityRewrites: outboundToMain
          .filter((target) => classify(target) === "compatibility-reexport")
          .map((target) => ({
            to: target,
            suggestedOwner: ownershipByModule.get(target)?.finalOwner ?? target,
          })),
        mainDependenciesToResolve: outboundToMain.filter(
          (target) => classify(target) === "main-dependency",
        ),
        intraBatchDependencies: outboundToMain.filter(
          (target) => classify(target) === "intra-batch",
        ),
        electronRuntimeImports: graph.edges
          .filter(
            (edge) => edge.from === node.id && edge.to === "external:electron" && !edge.typeOnly,
          )
          .map((edge) => edge.occurrences[0]?.line),
      });
    }
    modules.sort((left, right) => left.module.localeCompare(right.module));
    const moduleIds = modules.map((entry) => entry.module);
    const expectedTests = uniqueSorted([
      ...graph.edges
        .filter(
          (edge) => moduleIds.includes(edge.to) && graph.nodes.get(edge.from)?.isTest === true,
        )
        .map((edge) => edge.from),
      ...graph.nodes
        .values()
        .filter((node) => node.isTest && batchIds.has(node.id))
        .map((node) => node.id),
    ]);
    return {
      ...batch,
      modules,
      consumerCount: uniqueSorted(modules.flatMap((entry) => entry.consumers)).length,
      expectedTests,
    };
  });

  const batchedModuleIds = new Set(
    moveBatches.flatMap((batch) => batch.modules.map((entry) => entry.module)),
  );
  const additionalMoveCandidates = uniqueSorted(
    audit.violations
      .filter(
        (violation) =>
          (violation.targetClass === "implementation" ||
            violation.targetClass === "barrel-to-main") &&
          !batchedModuleIds.has(violation.to),
      )
      .map((violation) => violation.to),
  ).map((moduleId) => ({
    module: moduleId,
    consumers: uniqueSorted(
      graph.edges.filter((edge) => edge.to === moduleId && !edge.typeOnly).map((edge) => edge.from),
    ),
    classification: ownershipByModule.get(moduleId)?.kind ?? "implementation",
    rationale:
      "Referenced at runtime by a shared/backend root but not in a declared move batch; " +
      "either add it to the owning batch or invert the dependency.",
  }));

  const compatibilityReexports = ownership.filter(
    (entry) => entry.kind === "compatibility-reexport",
  );

  return {
    formatVersion: ARCHITECTURE_INVENTORY_FORMAT_VERSION,
    generatedBy: "scripts/architecture-imports.mjs",
    rootDir: graph.rootDir,
    graph: graph.stats,
    entries,
    roots: {
      build: buildRootIds,
      tool: toolRoots.map((root) => root.path),
      config: configRoots.map((root) => root.path),
      plugin: pluginRoots,
      deploy: deployReferences,
      reference: testEntryReferences,
      testCount: testRootIds.length,
      package: packageRootIds,
      nativeReferences,
    },
    audit,
    electronChains: findElectronChains(graph, buildRootIds),
    unresolved: annotateGeneratedArtifacts(graph.unresolved, graph.rootDir),
    warnings: graph.warnings,
    compatibilityReexports: compatibilityReexports.map((entry) => ({
      module: entry.module,
      finalOwner: entry.finalOwner,
      consumers: uniqueSorted(inboundAny.get(entry.module)?.runtime ?? []),
      typeConsumers: uniqueSorted(inboundAny.get(entry.module)?.type ?? []),
      testConsumers: uniqueSorted(inboundAny.get(entry.module)?.test ?? []),
    })),
    unusedCompatibilityReexports,
    moveBatches,
    additionalMoveCandidates,
    deletionCandidates,
    reachability: {
      buildReachable: [...graph.nodes.keys()].filter((id) => reachability.get(id)?.has("build"))
        .length,
      toolReachable: [...graph.nodes.keys()].filter((id) => reachability.get(id)?.has("tool"))
        .length,
      pluginReachable: [...graph.nodes.keys()].filter((id) => reachability.get(id)?.has("plugin"))
        .length,
      deployReachable: [...graph.nodes.keys()].filter((id) => reachability.get(id)?.has("deploy"))
        .length,
      testOnly: [...graph.nodes.keys()].filter((id) => {
        const categories = reachability.get(id);
        return categories?.has("test") && categories.size === 1;
      }).length,
    },
  };
}
