import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  isCursorSdkObjectLike,
  parseCursorSdkVersion,
  type CursorSdkDiagnostic,
  type CursorSdkExecutionEnvironment,
  type CursorSdkPackageSource,
} from "./sdkLoaderSupport";

const CURSOR_SDK_PACKAGE_NAME = "@cursor/sdk";
const PACKAGE_JSON_MAX_BYTES = 1024 * 1024;
const GLOBAL_ROOT_PROBE_TIMEOUT_MS = 5_000;
const GLOBAL_ROOT_PROBE_MAX_BYTES = 64 * 1024;

export type CursorSdkGlobalRootSource = "global-npm" | "global-pnpm";

export interface CursorSdkGlobalPackageRoot {
  root: string;
  source: CursorSdkGlobalRootSource;
}

export interface CursorSdkLoadOptions {
  /**
   * An explicit `@cursor/sdk` package directory, its package.json/entry file,
   * a node_modules directory, or a directory containing node_modules.
   * Explicit configuration is authoritative: an invalid path does not
   * silently fall back to another installed copy.
   */
  configuredPath?: string;
  /** Native project directory used for normal Node ancestor discovery. */
  projectCwd?: string;
  /** Defaults to the current process environment. */
  environment?: CursorSdkExecutionEnvironment;
  /**
   * API key supplied to SDK calls by the session adapter. It is only checked
   * for presence here and is never returned from the loader result.
   */
  apiKey?: string;
  /** Defaults to `process.env`; injectable so callers can use provider env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Additional global node_modules roots, ahead of inferred npm/pnpm roots. */
  globalPackageRoots?: readonly string[];
  /** Disable NODE_PATH and global npm/pnpm discovery. Primarily useful in tests. */
  includeGlobal?: boolean;
  /** Runtime probes default to the current process values. */
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

/**
 * Optional host hooks. The default implementation performs ordinary dynamic
 * import and safe, non-shell npm/pnpm root probes. A future WSL worker can
 * provide equivalent hooks inside Linux without importing Linux packages into
 * the Windows supervisor.
 */
export interface CursorSdkLoaderDependencies {
  importModule?: (specifier: string) => Promise<unknown>;
  /** Injectable to keep discovery tests independent of the host Node install. */
  executablePath?: string;
  resolvePackageManagerRoots?: (input: {
    platform: NodeJS.Platform;
    env: Readonly<Record<string, string | undefined>>;
  }) => Promise<readonly CursorSdkGlobalPackageRoot[]>;
}

interface CursorSdkPackageJson {
  name?: unknown;
  version?: unknown;
  main?: unknown;
  module?: unknown;
  exports?: unknown;
  optionalDependencies?: unknown;
}

export interface DiscoveredCursorSdkPackage {
  packageRoot: string;
  packageJsonPath: string;
  manifest: CursorSdkPackageJson;
  version: string;
  source: CursorSdkPackageSource;
}

type PackageInspection =
  | { kind: "missing" }
  | { kind: "invalid"; reason: string }
  | { kind: "found"; value: DiscoveredCursorSdkPackage };

interface PackageCandidate {
  path: string;
  source: CursorSdkPackageSource;
}

export interface CursorSdkDiscoveryFailure {
  diagnostic: CursorSdkDiagnostic;
}

export async function discoverCursorSdkPackage(
  options: CursorSdkLoadOptions = {},
  dependencies: CursorSdkLoaderDependencies = {},
): Promise<DiscoveredCursorSdkPackage | CursorSdkDiscoveryFailure> {
  if (options.configuredPath) {
    const configured = await discoverConfiguredPackage(
      options.configuredPath,
      options.projectCwd ?? process.cwd(),
    );
    if (configured) return configured;
    return {
      diagnostic: {
        code: "configured_path_invalid",
        message: "The configured Cursor SDK path is not a valid @cursor/sdk installation.",
        recoverable: true,
        details: { configuredPath: options.configuredPath },
      },
    };
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  // Filesystem-only candidates come first in the resolution order, so probing
  // `npm root -g` / `pnpm root -g` — two real subprocesses on every worker load
  // — is deferred until none of them holds an installation.
  const freeCandidates: PackageCandidate[] = [];
  addProjectCandidates(freeCandidates, options.projectCwd ?? process.cwd());
  if (options.includeGlobal !== false) {
    addEnvironmentCandidates(freeCandidates, env);
    for (const root of options.globalPackageRoots ?? []) {
      addModuleRootCandidates(freeCandidates, root, "global-explicit");
    }
    addInferredGlobalCandidates(
      freeCandidates,
      platform,
      env,
      dependencies.executablePath ?? process.execPath,
    );
  }

  const seenCandidates = new Set<string>();
  const checkedPaths: string[] = [];
  const free = await inspectCandidates(freeCandidates, seenCandidates, checkedPaths);
  if (free) return free;

  if (options.includeGlobal !== false) {
    const roots = await (
      dependencies.resolvePackageManagerRoots ?? resolveDefaultPackageManagerRoots
    )({ platform, env });
    const managerCandidates: PackageCandidate[] = [];
    for (const root of roots) addModuleRootCandidates(managerCandidates, root.root, root.source);
    const managed = await inspectCandidates(managerCandidates, seenCandidates, checkedPaths);
    if (managed) return managed;
  }

  return {
    diagnostic: {
      code: "package_missing",
      message:
        "The Cursor SDK is not installed. Install @cursor/sdk in the project or globally, or configure its package path.",
      recoverable: true,
      details: { checkedPaths },
    },
  };
}

export async function resolveCursorSdkPackageEntry(
  pkg: DiscoveredCursorSdkPackage,
): Promise<{ entryPath: string } | CursorSdkDiscoveryFailure> {
  const exportTarget = resolveExportTarget(pkg.manifest.exports);
  const relativeEntry =
    exportTarget ??
    (typeof pkg.manifest.module === "string"
      ? pkg.manifest.module
      : typeof pkg.manifest.main === "string"
        ? pkg.manifest.main
        : "index.js");
  const entryPath = resolve(pkg.packageRoot, relativeEntry);
  const relativeToRoot = relative(pkg.packageRoot, entryPath);
  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeToRoot)
  ) {
    return {
      diagnostic: {
        code: "package_invalid",
        message: "The Cursor SDK package entry points outside its package directory.",
        recoverable: true,
        details: { packageRoot: pkg.packageRoot },
      },
    };
  }
  const info = await statOrUndefined(entryPath);
  if (!info?.isFile()) {
    return {
      diagnostic: {
        code: "package_invalid",
        message: "The Cursor SDK package entry file is missing.",
        recoverable: true,
        details: { entryPath },
      },
    };
  }
  return { entryPath };
}

export async function resolveCursorSdkPlatformHelper(
  pkg: DiscoveredCursorSdkPackage,
  helperName: string,
): Promise<{ name: string; packageRoot: string; version: string } | CursorSdkDiscoveryFailure> {
  const helperRoot = await findResolvablePackageRoot(pkg.packageRoot, helperName);
  if (!helperRoot) {
    return {
      diagnostic: {
        code: "platform_helper_missing",
        message: `The Cursor SDK platform helper ${helperName} is not installed.`,
        recoverable: true,
        details: { platformHelper: helperName, sdkVersion: pkg.version },
      },
    };
  }

  const helperManifestPath = join(helperRoot, "package.json");
  let manifest: CursorSdkPackageJson;
  try {
    manifest = JSON.parse(await readFile(helperManifestPath, "utf8")) as CursorSdkPackageJson;
  } catch {
    return {
      diagnostic: {
        code: "platform_helper_incompatible",
        message: `The Cursor SDK platform helper ${helperName} has invalid metadata.`,
        recoverable: true,
        details: { platformHelper: helperName },
      },
    };
  }
  if (manifest.name !== helperName || typeof manifest.version !== "string") {
    return {
      diagnostic: {
        code: "platform_helper_incompatible",
        message: `The Cursor SDK platform helper ${helperName} has invalid metadata.`,
        recoverable: true,
        details: { platformHelper: helperName },
      },
    };
  }

  const optionalDependencies = isCursorSdkObjectLike(pkg.manifest.optionalDependencies)
    ? pkg.manifest.optionalDependencies
    : undefined;
  const declaredVersion =
    typeof optionalDependencies?.[helperName] === "string"
      ? optionalDependencies[helperName]
      : pkg.version;
  if (manifest.version !== declaredVersion) {
    return {
      diagnostic: {
        code: "platform_helper_incompatible",
        message: `The Cursor SDK platform helper ${helperName} does not match the SDK version.`,
        recoverable: true,
        details: {
          platformHelper: helperName,
          expectedVersion: declaredVersion,
          detectedVersion: manifest.version,
        },
      },
    };
  }
  return {
    name: helperName,
    packageRoot: await realpath(helperRoot),
    version: manifest.version,
  };
}

async function discoverConfiguredPackage(
  configuredPath: string,
  baseDirectory: string,
): Promise<DiscoveredCursorSdkPackage | undefined> {
  const absolutePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(baseDirectory, configuredPath);
  const info = await statOrUndefined(absolutePath);
  if (!info) return undefined;

  if (info.isFile()) {
    const start = basename(absolutePath) === "package.json" ? dirname(absolutePath) : absolutePath;
    const packageRoot =
      info.isFile() && start === absolutePath
        ? await findContainingCursorSdkPackage(dirname(absolutePath))
        : start;
    if (!packageRoot) return undefined;
    const inspected = await inspectPackageRoot(packageRoot, "configured");
    return inspected.kind === "found" ? inspected.value : undefined;
  }

  if (!info.isDirectory()) return undefined;
  const configuredCandidates = [
    absolutePath,
    join(absolutePath, "@cursor", "sdk"),
    join(absolutePath, "node_modules", "@cursor", "sdk"),
  ];
  if (basename(absolutePath) === "@cursor") configuredCandidates.unshift(join(absolutePath, "sdk"));

  for (const candidate of dedupePaths(configuredCandidates)) {
    const inspected = await inspectPackageRoot(candidate, "configured");
    if (inspected.kind === "found") return inspected.value;
  }
  return undefined;
}

async function findContainingCursorSdkPackage(start: string): Promise<string | undefined> {
  let current = resolve(start);
  while (true) {
    const inspected = await inspectPackageRoot(current, "configured");
    if (inspected.kind === "found") return inspected.value.packageRoot;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function addProjectCandidates(candidates: PackageCandidate[], projectCwd: string): void {
  let current = resolve(projectCwd);
  while (true) {
    candidates.push({
      path: join(current, "node_modules", "@cursor", "sdk"),
      source: "project",
    });
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function addEnvironmentCandidates(
  candidates: PackageCandidate[],
  env: Readonly<Record<string, string | undefined>>,
): void {
  for (const root of env.NODE_PATH?.split(delimiter) ?? []) {
    if (root.trim()) addModuleRootCandidates(candidates, root.trim(), "node-path");
  }
}

function addInferredGlobalCandidates(
  candidates: PackageCandidate[],
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  executablePath: string,
): void {
  const executableDirectory = dirname(executablePath);
  const inferredRoot =
    platform === "win32"
      ? join(executableDirectory, "node_modules")
      : resolve(executableDirectory, "..", "lib", "node_modules");
  addModuleRootCandidates(candidates, inferredRoot, "global-inferred");

  const prefix = env.npm_config_prefix ?? env.NPM_CONFIG_PREFIX;
  if (prefix) {
    addModuleRootCandidates(
      candidates,
      platform === "win32" ? join(prefix, "node_modules") : join(prefix, "lib", "node_modules"),
      "global-inferred",
    );
  }
}

function addModuleRootCandidates(
  candidates: PackageCandidate[],
  root: string,
  source: CursorSdkPackageSource,
): void {
  const absoluteRoot = resolve(root);
  if (basename(absoluteRoot) === "sdk" && basename(dirname(absoluteRoot)) === "@cursor") {
    candidates.push({ path: absoluteRoot, source });
    return;
  }
  if (basename(absoluteRoot) === "@cursor") {
    candidates.push({ path: join(absoluteRoot, "sdk"), source });
    return;
  }
  candidates.push({ path: join(absoluteRoot, "@cursor", "sdk"), source });
  candidates.push({ path: join(absoluteRoot, "node_modules", "@cursor", "sdk"), source });
}

/**
 * Inspect candidates in order, skipping any path already checked in an earlier
 * batch. Resolves to the winning package, a fatal `package_invalid` failure, or
 * `undefined` when this batch holds no `@cursor/sdk`.
 */
async function inspectCandidates(
  candidates: readonly PackageCandidate[],
  seen: Set<string>,
  checkedPaths: string[],
): Promise<DiscoveredCursorSdkPackage | CursorSdkDiscoveryFailure | undefined> {
  for (const candidate of candidates) {
    const key = process.platform === "win32" ? candidate.path.toLowerCase() : candidate.path;
    if (seen.has(key)) continue;
    seen.add(key);
    checkedPaths.push(candidate.path);
    const inspected = await inspectPackageRoot(candidate.path, candidate.source);
    if (inspected.kind === "missing") continue;
    if (inspected.kind === "invalid") {
      return {
        diagnostic: {
          code: "package_invalid",
          message: "A Cursor SDK package was found, but its package metadata is invalid.",
          recoverable: true,
          details: { packageRoot: candidate.path, reason: inspected.reason },
        },
      };
    }
    return inspected.value;
  }
  return undefined;
}

function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

async function inspectPackageRoot(
  candidateRoot: string,
  source: CursorSdkPackageSource,
): Promise<PackageInspection> {
  const packageJsonPath = join(candidateRoot, "package.json");
  const info = await statOrUndefined(packageJsonPath);
  if (!info) return { kind: "missing" };
  if (!info.isFile()) return { kind: "invalid", reason: "package.json is not a file" };
  if (info.size > PACKAGE_JSON_MAX_BYTES) {
    return { kind: "invalid", reason: "package.json exceeds the size limit" };
  }

  let manifest: CursorSdkPackageJson;
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as CursorSdkPackageJson;
  } catch {
    return { kind: "invalid", reason: "package.json is not valid JSON" };
  }
  if (manifest.name !== CURSOR_SDK_PACKAGE_NAME) {
    return { kind: "invalid", reason: `package name is not ${CURSOR_SDK_PACKAGE_NAME}` };
  }
  if (typeof manifest.version !== "string" || !parseCursorSdkVersion(manifest.version)) {
    return { kind: "invalid", reason: "package version is not valid semver" };
  }

  const canonicalRoot = await realpath(candidateRoot);
  return {
    kind: "found",
    value: {
      packageRoot: canonicalRoot,
      packageJsonPath: join(canonicalRoot, "package.json"),
      manifest,
      version: manifest.version,
      source,
    },
  };
}

function resolveExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = resolveExportTarget(item);
      if (target) return target;
    }
    return undefined;
  }
  if (!isCursorSdkObjectLike(value)) return undefined;
  if ("." in value) return resolveExportTarget(value["."]);
  for (const condition of ["import", "node", "default", "require"]) {
    if (condition in value) {
      const target = resolveExportTarget(value[condition]);
      if (target) return target;
    }
  }
  return undefined;
}

async function findResolvablePackageRoot(
  packageRoot: string,
  packageName: string,
): Promise<string | undefined> {
  try {
    const requireFromSdk = createRequire(join(packageRoot, "package.json"));
    const packageJsonPath = requireFromSdk.resolve(`${packageName}/package.json`);
    return dirname(packageJsonPath);
  } catch {
    // Some packages export-hide package.json. Fall through to the same
    // ancestor node_modules search Node uses.
  }

  const [scope, name] = packageName.split("/");
  if (!scope || !name) return undefined;
  let current = packageRoot;
  while (true) {
    const candidate = join(current, "node_modules", scope, name);
    if (await fileExists(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function resolveDefaultPackageManagerRoots(input: {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}): Promise<readonly CursorSdkGlobalPackageRoot[]> {
  const probes = await Promise.all(
    (["npm", "pnpm"] as const).map(async (manager) => {
      const root = await probePackageManagerRoot(manager, input.platform, input.env);
      return root ? { root, source: `global-${manager}` as const } : undefined;
    }),
  );
  return probes.filter((probe): probe is CursorSdkGlobalPackageRoot => probe !== undefined);
}

async function probePackageManagerRoot(
  manager: "npm" | "pnpm",
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): Promise<string | undefined> {
  const output = await new Promise<string | undefined>((resolveOutput) => {
    const command = platform === "win32" ? env.ComSpec || env.COMSPEC || "cmd.exe" : manager;
    const args =
      platform === "win32" ? ["/d", "/s", "/c", `${manager}.cmd root -g`] : ["root", "-g"];
    execFile(
      command,
      args,
      {
        env: env as NodeJS.ProcessEnv,
        timeout: GLOBAL_ROOT_PROBE_TIMEOUT_MS,
        maxBuffer: GLOBAL_ROOT_PROBE_MAX_BYTES,
        windowsHide: true,
      },
      (error, stdout) => resolveOutput(error ? undefined : stdout),
    );
  });
  if (!output) return undefined;
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => line.length > 0 && isAbsolute(line));
}

async function statOrUndefined(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
