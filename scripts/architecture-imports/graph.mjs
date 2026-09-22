/**
 * Import graph construction and type-erasure evidence.
 *
 * Builds the module graph: scans each file, separates type-only edges from
 * runtime edges with esbuild type-erasure evidence, follows file references and
 * classifies barrels/compatibility re-exports.
 */
import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { transformSync } from "esbuild";
import { SyntaxKind as K } from "typescript/unstable/ast";
import {
  JSX_EXTENSIONS,
  TS_EXTENSIONS,
  isFixturePath,
  isGeneratedPath,
  isTestFile,
  rootOfFile,
  toPosix,
  uniqueSorted,
} from "./paths.mjs";
import { createResolver, discoverSourceFiles, expandGlob } from "./resolver.mjs";
import { scanSourceReferences, tokenizeSource } from "./scanner.mjs";

const ERASURE_LOADERS = { ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx" };

export const ARCHITECTURE_GRAPH_FORMAT_VERSION = 1;

/**
 * Transform away TypeScript types and return the module specifiers that survive.
 * A dynamic `import("x")` that disappears is a type query, not a runtime edge.
 * Returns null when the file cannot be transformed (caller keeps ambiguity).
 */
function emittedSpecifiers(text, filePath) {
  const loader = ERASURE_LOADERS[extname(filePath).toLowerCase()];
  if (!loader) return null;
  try {
    return emittedSpecifiersFromCode(transformToJavaScript(text, loader));
  } catch {
    return null;
  }
}

function transformToJavaScript(text, loader) {
  return transformSync(text, {
    loader,
    format: "esm",
    target: "esnext",
    treeShaking: false,
    jsx: "transform",
    jsxFactory: "__poracode_jsx",
    jsxFragment: "__poracode_fragment",
    logLevel: "silent",
  }).code;
}

function emittedSpecifiersFromCode(code) {
  const specifiers = new Set();
  for (const occurrence of scanSourceReferences(code, "erased.js", { jsx: false })) {
    if (occurrence.computed) continue;
    if (occurrence.specifier) specifiers.add(occurrence.specifier);
  }
  return specifiers;
}

function detectBarrel(tokens) {
  // A pure re-export/tooling barrel contains only import/export statements.
  const allowed = new Set([
    K.ImportKeyword,
    K.ExportKeyword,
    K.FromKeyword,
    K.TypeKeyword,
    K.AsteriskToken,
    K.AsKeyword,
    K.OpenBraceToken,
    K.CloseBraceToken,
    K.CommaToken,
    K.SemicolonToken,
    K.StringLiteral,
    K.NoSubstitutionTemplateLiteral,
    K.Identifier,
    K.DefaultKeyword,
  ]);
  let hasExportFrom = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!allowed.has(token.kind)) return false;
    if (token.kind === K.ExportKeyword) {
      for (let cursor = index + 1; cursor < tokens.length; cursor++) {
        if (tokens[cursor].kind === K.FromKeyword) {
          hasExportFrom = true;
          break;
        }
        if (tokens[cursor].kind === K.SemicolonToken) break;
      }
    }
  }
  return hasExportFrom;
}

function scanFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const extension = extname(filePath).toLowerCase();
  const jsx = JSX_EXTENSIONS.has(extension);
  if (jsx) {
    // JSX text cannot be tokenized reliably without a parser; scan the
    // JSX-free transform output instead and flag type edges as incomplete.
    const loader = ERASURE_LOADERS[extension] ?? "tsx";
    try {
      const occurrences = scanSourceReferences(transformToJavaScript(text, loader), filePath, {
        jsx: false,
      });
      return {
        occurrences: occurrences.map((occurrence) =>
          occurrence.computed
            ? occurrence
            : { ...occurrence, typeOnly: occurrence.typeOnly ?? false },
        ),
        scanMode: "transformed-jsx",
        typeOnlyEdgesComplete: false,
        tokens: null,
      };
    } catch {
      return {
        occurrences: [],
        scanMode: "unparsed-jsx",
        typeOnlyEdgesComplete: false,
        tokens: null,
      };
    }
  }
  const tokens = tokenizeSource(text, { jsx: false });
  return {
    occurrences: scanSourceReferences(text, filePath, { jsx: false }),
    scanMode: "source",
    typeOnlyEdgesComplete: true,
    tokens,
  };
}

export function buildImportGraph(options) {
  const rootDir = resolve(options.rootDir);
  const resolver = createResolver({ rootDir, workspacePackages: options.workspacePackages });
  const followFile = options.followFile !== false;
  const files = options.files ?? discoverSourceFiles({ rootDir, ...options });
  const nodes = new Map();
  const edges = [];
  const edgeIndex = new Map();
  const unresolved = [];
  const warnings = [];
  const pending = [...files];

  const ensureNode = (absolutePath) => {
    const id = toPosix(relative(rootDir, absolutePath));
    let node = nodes.get(id);
    if (!node) {
      const extension = extname(absolutePath).toLowerCase();
      node = {
        id,
        absolutePath,
        root: rootOfFile(absolutePath, rootDir),
        isTest: isTestFile(id),
        isDeclaration: id.endsWith(".d.ts") || id.endsWith(".d.mts"),
        isScript: id.startsWith("scripts/") || [".mjs", ".cjs"].includes(extension),
        generated: isGeneratedPath(id),
        fixture: isFixturePath(id),
        barrel: false,
        compatibilityReexport: false,
        reexportTargets: [],
        typeOnlyEdgesComplete: true,
        scanMode: "source",
        occurrences: [],
        edges: [],
        scanned: false,
        globsExpanded: false,
      };
      nodes.set(id, node);
    }
    return node;
  };

  const recordEdge = (fromId, toId, occurrence, typeOnly, external) => {
    const key = `${fromId}\u0000${toId}\u0000${typeOnly ? "type" : "runtime"}`;
    let edge = edgeIndex.get(key);
    if (!edge) {
      edge = {
        from: fromId,
        to: toId,
        key,
        typeOnly,
        kind: occurrence.kind,
        external,
        specifier: occurrence.specifier,
        occurrences: [],
      };
      edges.push(edge);
      edgeIndex.set(key, edge);
    }
    edge.occurrences.push({
      line: occurrence.line,
      column: occurrence.column,
      kind: occurrence.kind,
      typeOnly,
      computed: occurrence.computed === true,
      worker: occurrence.worker === true,
    });
    return edge;
  };

  const unresolvedReason = (resolution, occurrence) => {
    if (resolution.reason === "unresolved-relative") {
      if (occurrence.kind === "test-mock") return "stale-test-mock";
      if (typeof occurrence.specifier === "string" && occurrence.specifier.endsWith(".node")) {
        return "native-binary";
      }
      if (occurrence.kind === "url-asset") return "url-directory-or-asset";
    }
    return resolution.reason;
  };

  const processFile = (filePath) => {
    const node = ensureNode(filePath);
    if (node.scanned) return;
    node.scanned = true;

    let parsed;
    try {
      parsed = scanFile(filePath);
    } catch (error) {
      warnings.push({ file: node.id, reason: `scan-failed: ${String(error)}` });
      return;
    }
    node.scanMode = parsed.scanMode;
    node.typeOnlyEdgesComplete = parsed.typeOnlyEdgesComplete;
    node.occurrences = parsed.occurrences;
    if (parsed.tokens) node.barrel = detectBarrel(parsed.tokens);

    const erasureNeeded = parsed.occurrences.some(
      (occurrence) => occurrence.kind === "dynamic" && occurrence.typeOnly == null,
    );
    const emitted = erasureNeeded
      ? emittedSpecifiers(readFileSync(filePath, "utf8"), filePath)
      : null;
    if (erasureNeeded && emitted === null && TS_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      warnings.push({ file: node.id, reason: "type-erasure-transform-failed" });
    }

    for (const occurrence of parsed.occurrences) {
      let typeOnly = occurrence.typeOnly;
      if (typeOnly == null) {
        if (occurrence.kind === "dynamic" && emitted !== null && occurrence.specifier) {
          typeOnly = !emitted.has(occurrence.specifier);
        } else {
          typeOnly = false;
        }
      }
      node.edges.push({ ...occurrence, typeOnly });

      if (occurrence.computed) {
        unresolved.push({
          from: node.id,
          line: occurrence.line,
          kind: occurrence.kind,
          reason: "computed-specifier",
          raw: occurrence.raw,
          ambiguous: true,
        });
        continue;
      }
      if (occurrence.kind === "glob") {
        // Glob patterns are expanded in a dedicated pass below.
        continue;
      }
      const resolution = resolver.resolve(occurrence.specifier, filePath);
      if (resolution.kind === "unresolved") {
        unresolved.push({
          from: node.id,
          line: occurrence.line,
          kind: occurrence.kind,
          specifier: occurrence.specifier,
          reason: unresolvedReason(resolution, occurrence),
          ambiguous: false,
        });
        continue;
      }
      let to;
      if (resolution.kind === "file") {
        if (followFile && !nodes.has(toPosix(relative(rootDir, resolution.path)))) {
          pending.push(resolution.path);
        }
        to = toPosix(relative(rootDir, resolution.path));
      } else if (resolution.kind === "builtin") {
        to = resolution.id;
      } else {
        to = `external:${resolution.id}`;
      }
      recordEdge(node.id, to, occurrence, typeOnly, resolution.kind !== "file");
    }
  };

  const expandGlobs = () => {
    let expandedAny = false;
    for (const node of nodes.values()) {
      if (!node.scanned || node.globsExpanded) continue;
      node.globsExpanded = true;
      for (const occurrence of node.edges.filter((edge) => edge.kind === "glob")) {
        if (!occurrence.specifier) continue;
        if (!occurrence.specifier.startsWith(".")) {
          unresolved.push({
            from: node.id,
            line: occurrence.line,
            kind: "glob",
            specifier: occurrence.specifier,
            reason: "glob-non-relative",
            ambiguous: true,
          });
          continue;
        }
        const matches = expandGlob(resolve(dirname(node.absolutePath), occurrence.specifier));
        if (matches.length === 0) {
          unresolved.push({
            from: node.id,
            line: occurrence.line,
            kind: "glob",
            specifier: occurrence.specifier,
            reason: "glob-no-match",
            ambiguous: true,
          });
          continue;
        }
        for (const match of matches) {
          const targetId = toPosix(relative(rootDir, match));
          if (followFile && !nodes.has(targetId)) {
            pending.push(match);
            expandedAny = true;
          }
          recordEdge(node.id, targetId, occurrence, false, false);
        }
      }
    }
    return expandedAny;
  };

  while (pending.length > 0) processFile(pending.pop());
  for (;;) {
    const expanded = expandGlobs();
    if (pending.length === 0 && !expanded) break;
    while (pending.length > 0) processFile(pending.pop());
  }

  // Barrel / compatibility re-export classification.
  for (const node of nodes.values()) {
    if (!node.barrel) continue;
    const targets = uniqueSorted(
      edges
        .filter(
          (edge) =>
            edge.from === node.id &&
            !edge.typeOnly &&
            (edge.kind === "export-from" || edge.kind === "static") &&
            !edge.external,
        )
        .map((edge) => edge.to),
    );
    node.reexportTargets = targets;
    const outsideOwnRoot = targets.some((target) => {
      const targetNode = nodes.get(target);
      return targetNode ? targetNode.root !== node.root : false;
    });
    const insideOwnRoot = targets.some((target) => {
      const targetNode = nodes.get(target);
      return targetNode ? targetNode.root === node.root : false;
    });
    node.compatibilityReexport = targets.length > 0 && outsideOwnRoot && !insideOwnRoot;
  }

  return {
    formatVersion: ARCHITECTURE_GRAPH_FORMAT_VERSION,
    rootDir,
    nodes,
    edges,
    unresolved,
    warnings,
    stats: {
      files: nodes.size,
      edges: edges.length,
      runtimeEdges: edges.filter((edge) => !edge.typeOnly).length,
      typeOnlyEdges: edges.filter((edge) => edge.typeOnly).length,
      externalEdges: edges.filter((edge) => edge.external).length,
      barrels: [...nodes.values()].filter((node) => node.barrel).length,
      compatibilityReexports: [...nodes.values()].filter((node) => node.compatibilityReexport)
        .length,
      unresolvedComputed: unresolved.filter((entry) => entry.reason === "computed-specifier")
        .length,
      unresolvedOther: unresolved.filter((entry) => entry.reason !== "computed-specifier").length,
      warnings: warnings.length,
    },
  };
}
