export const ARCHITECTURE_GRAPH_FORMAT_VERSION: 1;
export const ARCHITECTURE_INVENTORY_FORMAT_VERSION: 1;
export const SHARED_BACKEND_ROOTS: readonly string[];
export const NON_MAIN_ROOTS: readonly string[];
export const DEFAULT_BOUNDARY_RULES: readonly { id: string; description: string }[];
export const MOVE_BATCHES: readonly {
  id: string;
  title: string;
  order: string;
  modules: readonly string[];
  destination: string;
  rationale: string;
}[];

export interface SourceToken {
  kind: number;
  text: string;
  value: string | undefined;
  start: number;
  end: number;
  location: { line: number; column: number };
}

export type ModuleReferenceKind =
  | "static"
  | "side-effect"
  | "export-from"
  | "dynamic"
  | "require"
  | "import-equals"
  | "url-asset"
  | "glob"
  | "test-mock";

export interface ModuleReference {
  kind: ModuleReferenceKind;
  specifier: string | null;
  computed: boolean;
  typeOnly?: boolean | null;
  worker?: boolean;
  line: number;
  column: number;
  raw: string | null;
}

export interface GraphNode {
  id: string;
  root: string;
  isTest: boolean;
  isDeclaration: boolean;
  isScript: boolean;
  generated: boolean;
  fixture: boolean;
  barrel: boolean;
  compatibilityReexport: boolean;
  reexportTargets: string[];
  typeOnlyEdgesComplete: boolean;
  scanMode: string;
  occurrences: ModuleReference[];
  edges: (ModuleReference & { typeOnly: boolean })[];
  scanned: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  key: string;
  typeOnly: boolean;
  kind: string;
  external: boolean;
  specifier: string | null;
  occurrences: {
    line: number;
    column?: number;
    kind?: string;
    typeOnly: boolean;
    computed?: boolean;
    worker?: boolean;
  }[];
}

export interface UnresolvedReference {
  from: string;
  line: number;
  kind: string;
  reason: string;
  specifier?: string;
  raw?: string;
  ambiguous: boolean;
  generatedBy?: string;
}

export interface ImportGraph {
  formatVersion: number;
  rootDir: string;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  unresolved: UnresolvedReference[];
  warnings: { file: string; reason: string }[];
  stats: Record<string, number>;
}

export interface BoundaryViolation {
  ruleId: string;
  severity: "violation" | "migration" | "compat-reexport";
  from: string;
  to: string;
  specifier: string | null;
  targetClass: string;
  finalOwner?: string;
  line?: number;
  chain: { from: string; to: string; specifier: string | null; kind: string; line?: number }[];
}

export interface BoundaryAudit {
  rules: { id: string; description: string | undefined }[];
  violations: BoundaryViolation[];
  hardViolations: number;
  migrationEdges: number;
  compatReexportEdges: number;
}

export function isTestFile(filePath: string): boolean;
export function isGeneratedPath(filePath: string): boolean;
export function isFixturePath(filePath: string): boolean;
export function rootOfFile(filePath: string, rootDir: string): string;
export function tokenizeSource(
  text: string,
  options?: { jsx?: boolean; tokenLimit?: number },
): SourceToken[];
export function scanSourceReferences(
  text: string,
  filePath?: string,
  options?: { jsx?: boolean },
): ModuleReference[];
export function createResolver(options: {
  rootDir: string;
  workspacePackages?: Map<string, unknown>;
}): {
  rootDir: string;
  resolve(
    specifier: string,
    fromFile: string,
  ):
    | { kind: "builtin"; id: string; query?: string }
    | { kind: "file"; path: string; query?: string }
    | { kind: "external"; id: string; packageName: string; query?: string }
    | { kind: "unresolved"; reason: string; query?: string };
};
export function discoverSourceFiles(options: {
  rootDir: string;
  include?: string[];
  extraFiles?: string[];
}): string[];
export function buildImportGraph(options: {
  rootDir: string;
  files?: string[];
  followFile?: boolean;
  include?: string[];
}): ImportGraph;
export function collectBuildEntries(rootDir: string): {
  entries: { name: string; path: string; kind: string; source: string }[];
  manifestEntries: { entryPath: string; manifestEntry?: string }[];
  manifestNames: string[];
};
export function collectToolRoots(rootDir: string): { path: string; source: string }[];
export function collectConfigRoots(rootDir: string): { path: string }[];
export function collectPluginRoots(rootDir: string): { path: string; source: string }[];
export function collectDeployReferences(rootDir: string): { source: string; path: string }[];
export function collectTestEntryReferences(
  rootDir: string,
  testFileIds?: string[],
): { source: string; path: string }[];
export function collectNativeReferences(
  rootDir: string,
): { source: string; reference: string; resolved: string; exists: boolean }[];
export function auditBoundaries(
  graph: ImportGraph,
  options?: { rules?: readonly { id: string; description: string }[] },
): BoundaryAudit;
export function findElectronChains(
  graph: ImportGraph,
  roots: string[],
): { root: string; path: { from: string; to: string; line?: number }[] }[];
export function computeReachability(
  graph: ImportGraph,
  rootsByCategory: Record<string, string[]>,
): Map<string, Set<string>>;
export function classifyNodeOwnership(graph: ImportGraph): Record<string, unknown>[];
export function findConsumers(
  graph: ImportGraph,
  moduleId: string,
): {
  from: string;
  line: number;
  specifier: string | null;
  kind: string;
  typeOnly: boolean;
  test: boolean;
  worker: boolean;
}[];
export function buildInventory(graph: ImportGraph): Record<string, unknown>;
export function renderInventoryMarkdown(inventory: Record<string, unknown>): string;
export function expandGlob(pattern: string): string[];
export function main(argv?: string[]): number;
