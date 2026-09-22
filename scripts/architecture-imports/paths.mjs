/**
 * Shared path classification and collection primitives for the architecture analyzer.
 *
 * Repository path predicates, root calculation, extension sets and the patterns
 * that classify test/generated/fixture/non-source files. All analyzer modules
 * share these; the public API is re-exported by scripts/architecture-imports.mjs.
 */
import { relative, sep } from "node:path";

export const JSX_EXTENSIONS = new Set([".tsx", ".jsx"]);
export const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
export const GRAPH_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);
export const RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];
export const TEST_FILE_PATTERN = /(?:^|[/.])(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/u;
export const GENERATED_PATH_PATTERN =
  /(?:^|\/)(?:generated|locales|__fixtures__|dist|out|coverage)(?:\/|$)|\.gen\.[cm]?[jt]sx?$|\.generated\.[cm]?[jt]sx?$/u;
export const FIXTURE_PATH_PATTERN =
  /(?:^|\/)(?:__fixtures__|fixtures|testFixtures|\.testFixtures)(?:\/|$)|Fixtures?\.[cm]?[jt]sx?$/u;
export const NON_SOURCE_PATTERN =
  /(?:^|\/)(?:node_modules|\.git|dist|build|out|coverage|\.tmp|tmp|\.next|vendor|Pods|DerivedData|xcuserdata)(?:\/|$)/u;
export const DATA_OR_BINDING_PATTERN =
  /(?:^|\/)(?:native-bindings\.json|.*\.po|.*\.svg|.*\.png|.*\.json|.*\.md)$/u;
export const NON_CANDIDATE_ROOT_PATTERN = /^(?:resources|build|branding|public|native)\//u;
export const CONFIG_FILE_PATTERN = /\.config\.[cm]?[jt]s$/u;

export const WORKER_NAME_PATTERN = /Worker$|Mod$|Extension$/u;

export function toPosix(value) {
  return value.split(sep).join("/");
}

export function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function isTestFile(filePath) {
  return TEST_FILE_PATTERN.test(toPosix(filePath));
}

export function isGeneratedPath(filePath) {
  return GENERATED_PATH_PATTERN.test(toPosix(filePath));
}

export function isFixturePath(filePath) {
  return FIXTURE_PATH_PATTERN.test(toPosix(filePath));
}

export function rootOfFile(filePath, rootDir) {
  const rel = toPosix(relative(rootDir, filePath));
  const segments = rel.split("/");
  if (segments[0] === "src") return `src/${segments[1] ?? ""}`.replace(/\/$/u, "");
  if (segments[0] === "packages") return `packages/${segments[1] ?? ""}`;
  if (segments.length === 1) return "(root)";
  return segments[0];
}
