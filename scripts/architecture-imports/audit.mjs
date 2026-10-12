/**
 * Boundary policy audit.
 *
 * Declares the E1 boundary rules by owner root and reports runtime dependency
 * edges that violate them, with re-export vs implementation classification and
 * file:line chains. Electron chains from a root are reported separately.
 */

export const SHARED_BACKEND_ROOTS = Object.freeze([
  "src/host",
  "src/backend",
  "src/server",
  "src/supervisor",
  "src/shared",
]);

/** Roots whose runtime dependency on `src/main` is an E1 violation. */
export const NON_MAIN_ROOTS = SHARED_BACKEND_ROOTS;

export const DEFAULT_BOUNDARY_RULES = Object.freeze([
  {
    id: "electron-runtime-outside-main",
    description: "Only src/main may depend on the electron package at runtime.",
  },
  {
    id: "shared-backend-to-main",
    description:
      "src/host, src/backend, src/server, src/supervisor and src/shared must not import src/main at runtime.",
  },
]);

function chainForEdge(graph, edge) {
  const chain = [];
  let current = edge;
  const seen = new Set();
  for (;;) {
    const first = current.occurrences?.[0] ?? {};
    chain.push({
      from: current.from,
      to: current.to,
      specifier: current.specifier,
      kind: first.kind ?? current.kind,
      line: first.line,
      worker: first.worker === true,
    });
    if (seen.has(current.to)) break;
    seen.add(current.to);
    const targetNode = graph.nodes.get(current.to);
    if (!targetNode || (!targetNode.barrel && !targetNode.compatibilityReexport)) break;
    const nextEdge = graph.edges.find(
      (candidate) => candidate.from === targetNode.id && !candidate.typeOnly && !candidate.external,
    );
    if (!nextEdge) break;
    current = nextEdge;
  }
  return chain;
}

function severityForTarget(targetNode) {
  if (!targetNode) return "violation";
  if (targetNode.compatibilityReexport) return "compat-reexport";
  return "migration";
}

export function auditBoundaries(graph, options = {}) {
  const ruleIds = new Set((options.rules ?? DEFAULT_BOUNDARY_RULES).map((rule) => rule.id));
  const violations = [];
  const nodeFor = (id) => graph.nodes.get(id);

  for (const edge of graph.edges) {
    if (edge.typeOnly) continue;
    const fromNode = nodeFor(edge.from);
    if (!fromNode) continue;
    const targetNode = nodeFor(edge.to);

    if (
      ruleIds.has("electron-runtime-outside-main") &&
      edge.to === "external:electron" &&
      !fromNode.root.startsWith("src/main") &&
      !fromNode.isTest &&
      !fromNode.isScript
    ) {
      violations.push({
        ruleId: "electron-runtime-outside-main",
        severity: "violation",
        from: edge.from,
        to: edge.to,
        specifier: edge.specifier,
        targetClass: "electron",
        line: edge.occurrences[0]?.line,
        chain: chainForEdge(graph, edge),
      });
      continue;
    }

    if (
      ruleIds.has("shared-backend-to-main") &&
      NON_MAIN_ROOTS.includes(fromNode.root) &&
      targetNode?.root === "src/main" &&
      !fromNode.isTest
    ) {
      violations.push({
        ruleId: "shared-backend-to-main",
        severity: severityForTarget(targetNode),
        from: edge.from,
        to: edge.to,
        specifier: edge.specifier,
        targetClass: targetNode.compatibilityReexport
          ? "compatibility-reexport"
          : targetNode.barrel
            ? "barrel-to-main"
            : "implementation",
        finalOwner: targetNode.compatibilityReexport ? targetNode.reexportTargets[0] : undefined,
        line: edge.occurrences[0]?.line,
        chain: chainForEdge(graph, edge),
      });
    }
  }
  const sorted = violations.sort((left, right) => {
    if (left.from !== right.from) return left.from.localeCompare(right.from);
    return (left.line ?? 0) - (right.line ?? 0);
  });
  return {
    rules: [...ruleIds].map((id) => ({
      id,
      description: DEFAULT_BOUNDARY_RULES.find((rule) => rule.id === id)?.description,
    })),
    violations: sorted,
    hardViolations: sorted.filter((entry) => entry.severity === "violation").length,
    migrationEdges: sorted.filter((entry) => entry.severity === "migration").length,
    compatReexportEdges: sorted.filter((entry) => entry.severity === "compat-reexport").length,
  };
}

/** Runtime chains from non-main roots that reach the electron package. */
export function findElectronChains(graph, roots) {
  const chains = [];
  const runtimeEdges = graph.edges.filter((edge) => !edge.typeOnly);
  const byFrom = new Map();
  for (const edge of runtimeEdges) {
    const list = byFrom.get(edge.from) ?? [];
    list.push(edge);
    byFrom.set(edge.from, list);
  }
  for (const root of roots) {
    const rootNode = graph.nodes.get(root);
    const rootIsMain = rootNode?.root.startsWith("src/main") === true;
    if (rootIsMain) continue;
    const queue = [{ id: root, path: [] }];
    const seen = new Set();
    while (queue.length > 0) {
      const { id, path } = queue.shift();
      if (path.length > 32 || seen.has(id)) continue;
      seen.add(id);
      for (const edge of byFrom.get(id) ?? []) {
        const hop = {
          from: id,
          to: edge.to,
          line: edge.occurrences[0]?.line,
          specifier: edge.specifier,
        };
        if (edge.to === "external:electron") {
          chains.push({ root, path: [...path, hop] });
          continue;
        }
        if (!graph.nodes.has(edge.to)) continue;
        queue.push({ id: edge.to, path: [...path, hop] });
      }
    }
  }
  return chains;
}
