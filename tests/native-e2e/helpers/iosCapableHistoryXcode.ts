/**
 * Test-only Xcode seams for the B1 CAPABLE-HOST iOS device journey.
 *
 * Owns the build/test artifact identity (source freeze hash, generated
 * xctestrun environment injection, bundle hashes), the marker transport
 * contract with the integrated XCUITest, and the xcresult summary/attachment
 * reads. Everything here is read-only over the repository and the derived-data
 * build output; the run-time orchestrator owns process spawning.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { capableHistoryJourneyError } from "./androidCapableHistoryHost.ts";
import { runCommand } from "./androidCapableHistoryProcess.ts";
import type { IosCommandRunner, IosSimctlTarget } from "./iosCapableHistorySimulator.ts";

/**
 * The integrated Swift journey class
 * (`ios/App/NativeE2ETests/NativeCapableHistoryJourneyUITests.swift`) and its
 * `-only-testing` scope.
 */
export const IOS_CAPABLE_HISTORY_TEST_CLASS = "NativeCapableHistoryJourneyUITests";
export const IOS_CAPABLE_HISTORY_SCHEME = "App";
export const IOS_CAPABLE_HISTORY_PRODUCT_NAME = "App";
export const IOS_CAPABLE_HISTORY_BUILD_CONFIGURATION = "Debug";

/**
 * Phase markers the integrated XCUITest prints only after the corresponding
 * assertion passed. The journey refuses to call a run green when one is
 * missing from the captured xcodebuild output.
 *
 * `RECONNECT_ONLINE` is the mid-test handshake marker: the runner waits for it
 * and only then drives the post-foreground turn, so the fresh marker the test
 * later requires cannot have been visible before the send.
 */
export const IOS_CAPABLE_HISTORY_UI_MARKERS = [
  "IOS_CAPABLE_HISTORY_UI_FRESH_PAIR",
  "IOS_CAPABLE_HISTORY_UI_BLOCKED_NOTICE",
  "IOS_CAPABLE_HISTORY_UI_ACK_TAPPED",
  "IOS_CAPABLE_HISTORY_UI_PREFIX_VISIBLE",
  "IOS_CAPABLE_HISTORY_UI_LIVE_VISIBLE",
  "IOS_CAPABLE_HISTORY_UI_RECONNECT_ONLINE",
  "IOS_CAPABLE_HISTORY_UI_RECONNECT_RETAINED",
  "IOS_CAPABLE_HISTORY_UI_RECONNECT_LIVE_VISIBLE",
] as const;

/** Mid-test marker the runner blocks on before driving the fresh turn. */
export const IOS_CAPABLE_HISTORY_FOREGROUND_READY_MARKER =
  "IOS_CAPABLE_HISTORY_UI_RECONNECT_ONLINE";

export function extractIosJourneyMarkers(
  logText: string,
  required: readonly string[] = IOS_CAPABLE_HISTORY_UI_MARKERS,
): { readonly present: readonly string[]; readonly missing: readonly string[] } {
  const present = required.filter((marker) => logText.includes(marker));
  const missing = required.filter((marker) => !logText.includes(marker));
  return { present, missing };
}

// ── xctestrun environment injection (same seam as scripts/native-e2e.mjs) ───

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Injects test-runner environment variables into the `NativeE2ETests`
 * blueprint's `EnvironmentVariables` dictionary and pins
 * `ParallelizationEnabled` to false, exactly like the mock ios-ui runner. The
 * pairing URL only ever reaches the 0o600 injected xctestrun file.
 */
export function injectIosXctestEnvironment(
  plist: string,
  environment: Readonly<Record<string, string>>,
  blueprintName = "NativeE2ETests",
): string {
  const blueprint = `<key>BlueprintName</key>\n\t\t\t\t\t<string>${blueprintName}</string>`;
  const blueprintIndex = plist.indexOf(blueprint);
  if (blueprintIndex < 0) {
    throw capableHistoryJourneyError(
      "xctestrun-blueprint-missing",
      `${blueprintName} blueprint not found in the generated xctestrun`,
    );
  }
  const environmentIndex = plist.indexOf("<key>EnvironmentVariables</key>", blueprintIndex);
  const dictionaryIndex = plist.indexOf("<dict>", environmentIndex);
  if (environmentIndex < 0 || dictionaryIndex < 0) {
    throw capableHistoryJourneyError(
      "xctestrun-environment-missing",
      `${blueprintName} environment dictionary not found in the generated xctestrun`,
    );
  }
  const entries = Object.entries(environment)
    .map(
      ([key, value]) =>
        `\n\t\t\t\t\t\t<key>${xmlEscape(key)}</key>\n\t\t\t\t\t\t<string>${xmlEscape(value)}</string>`,
    )
    .join("");
  const insertion = dictionaryIndex + "<dict>".length;
  const withEnvironment = `${plist.slice(0, insertion)}${entries}${plist.slice(insertion)}`;
  const parallelKey = "<key>ParallelizationEnabled</key>\n\t\t\t\t\t<true/>";
  const parallelIndex = withEnvironment.indexOf(parallelKey, blueprintIndex);
  if (parallelIndex < 0) {
    throw capableHistoryJourneyError(
      "xctestrun-parallelization-missing",
      `${blueprintName} parallelization setting not found in the generated xctestrun`,
    );
  }
  return `${withEnvironment.slice(0, parallelIndex)}${parallelKey.replace("<true/>", "<false/>")}${withEnvironment.slice(parallelIndex + parallelKey.length)}`;
}

/**
 * `xcodebuild` expands `__TESTROOT__` from the xctestrun file's own directory.
 * The injected copy lives in the run directory (so the pairing URL stays
 * inside the 0700 namespace), which would otherwise make every product path
 * miss `Build/Products`. Rewriting the placeholders to the absolute products
 * and derived-data roots keeps the copy location-independent.
 */
export function absolutizeIosXctestRoots(
  plist: string,
  roots: { readonly productsDir: string; readonly derivedDataPath: string },
): string {
  if (!plist.includes("__TESTROOT__")) {
    throw capableHistoryJourneyError(
      "xctestrun-testroot-missing",
      "generated xctestrun has no __TESTROOT__ placeholder",
    );
  }
  return plist
    .replaceAll("__TESTROOT__", roots.productsDir)
    .replaceAll("__DERIVEDDATA__", roots.derivedDataPath);
}

export function locateGeneratedXctestrun(productsDir: string): string {
  const names = existsSync(productsDir)
    ? readdirSync(productsDir).filter(
        (name) => name.endsWith(".xctestrun") && !name.startsWith("NativeE2E-readiness"),
      )
    : [];
  if (names.length !== 1) {
    throw capableHistoryJourneyError(
      "xctestrun-not-unique",
      `expected exactly one generated xctestrun in ${productsDir}, found ${names.join(", ") || "none"}`,
    );
  }
  return join(productsDir, names[0] as string);
}

export function appBundlePathFor(
  productsDir: string,
  productName = IOS_CAPABLE_HISTORY_PRODUCT_NAME,
  configuration = IOS_CAPABLE_HISTORY_BUILD_CONFIGURATION,
): string {
  const bundlePath = join(productsDir, `${configuration}-iphonesimulator`, `${productName}.app`);
  if (!existsSync(bundlePath) || !statSync(bundlePath).isDirectory()) {
    throw capableHistoryJourneyError(
      "app-bundle-missing",
      `build-for-testing did not produce ${bundlePath}`,
    );
  }
  return bundlePath;
}

// ── Deterministic tree hashing (source freeze + built bundle) ───────────────

const WALK_EXCLUDED_DIRS = new Set([".tmp", "DerivedData", "build", ".build", "xcuserdata"]);
const WALK_EXCLUDED_FILES = new Set([".DS_Store"]);

interface WalkedEntry {
  readonly relativePath: string;
  readonly hash: string;
}

function walkEntries(root: string, options: { readonly includeSymlinks: boolean }): WalkedEntry[] {
  const entries: WalkedEntry[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
      if (entry.isDirectory()) {
        if (WALK_EXCLUDED_DIRS.has(entry.name)) continue;
        visit(join(dir, entry.name));
        continue;
      }
      if (WALK_EXCLUDED_FILES.has(entry.name)) continue;
      const path = join(dir, entry.name);
      const relativePath = relative(root, path).split(sep).join("/");
      if (entry.isSymbolicLink()) {
        if (!options.includeSymlinks) continue;
        entries.push({ relativePath, hash: `link:${readlinkSync(path)}` });
        continue;
      }
      if (!entry.isFile()) continue;
      entries.push({
        relativePath,
        hash: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
    }
  };
  visit(root);
  return entries.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
}

/** Deterministic sha256 over a directory tree's sorted `(path, content)` pairs. */
export function hashDirectoryTree(
  root: string,
  options: { readonly includeSymlinks?: boolean } = {},
): { readonly sha256: string; readonly fileCount: number } {
  const entries = walkEntries(root, { includeSymlinks: options.includeSymlinks === true });
  const digest = createHash("sha256");
  for (const entry of entries) digest.update(`${entry.relativePath}  ${entry.hash}\n`);
  return { sha256: digest.digest("hex"), fileCount: entries.length };
}

/** Frozen iOS source roots; the hash pins the app + test source + project file. */
export const IOS_CAPABLE_HISTORY_SOURCE_ROOTS = [
  "ios/App/App",
  "ios/App/NativeE2ETests",
  "ios/App/App.xcodeproj",
] as const;

export function iosSourceTreeSha256(
  repoRoot: string,
  roots: readonly string[] = IOS_CAPABLE_HISTORY_SOURCE_ROOTS,
): { readonly sha256: string; readonly fileCount: number; readonly roots: readonly string[] } {
  const digest = createHash("sha256");
  let fileCount = 0;
  for (const root of roots) {
    const absolute = resolve(repoRoot, root);
    if (!existsSync(absolute)) {
      throw capableHistoryJourneyError("ios-source-root-missing", absolute);
    }
    for (const entry of walkEntries(absolute, { includeSymlinks: false })) {
      digest.update(`${root}/${entry.relativePath}  ${entry.hash}\n`);
      fileCount += 1;
    }
  }
  return { sha256: digest.digest("hex"), fileCount, roots: [...roots] };
}

// ── xcresult summary + attachments (best-effort reads) ──────────────────────

export interface XcresultSummary {
  readonly ok: boolean;
  readonly result: string | null;
  readonly passedTests: number | null;
  readonly failedTests: number | null;
  readonly skippedTests: number | null;
  readonly raw: string;
  readonly error: string | null;
}

export async function readXcresultSummary(input: {
  readonly target: IosSimctlTarget;
  readonly resultBundlePath: string;
  readonly run?: IosCommandRunner;
}): Promise<XcresultSummary> {
  const run = input.run ?? ((command, args) => runCommand(command, args));
  const result = await run(input.target.command, [
    ...input.target.prefixArgs,
    "get",
    "test-results",
    "summary",
    "--path",
    input.resultBundlePath,
  ]);
  if (result.code !== 0) {
    return {
      ok: false,
      result: null,
      passedTests: null,
      failedTests: null,
      skippedTests: null,
      raw: result.stdout,
      error: `xcresulttool exited ${String(result.code)}: ${result.stderr.trim()}`,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const resultValue = typeof parsed["result"] === "string" ? parsed["result"] : null;
    const failedTests = typeof parsed["failedTests"] === "number" ? parsed["failedTests"] : null;
    return {
      ok: resultValue === "Passed" && (failedTests === null || failedTests === 0),
      result: resultValue,
      passedTests: typeof parsed["passedTests"] === "number" ? parsed["passedTests"] : null,
      failedTests,
      skippedTests: typeof parsed["skippedTests"] === "number" ? parsed["skippedTests"] : null,
      raw: result.stdout,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      result: null,
      passedTests: null,
      failedTests: null,
      skippedTests: null,
      raw: result.stdout,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface XcresultAttachments {
  readonly directory: string;
  readonly files: readonly string[];
  readonly hashes: Readonly<Record<string, string>>;
  readonly error: string | null;
}

export async function exportXcresultAttachments(input: {
  readonly target: IosSimctlTarget;
  readonly resultBundlePath: string;
  readonly outDir: string;
  readonly run?: IosCommandRunner;
}): Promise<XcresultAttachments> {
  const run = input.run ?? ((command, args) => runCommand(command, args));
  const result = await run(input.target.command, [
    ...input.target.prefixArgs,
    "export",
    "attachments",
    "--path",
    input.resultBundlePath,
    "--output-path",
    input.outDir,
  ]);
  if (result.code !== 0) {
    return {
      directory: input.outDir,
      files: [],
      hashes: {},
      error: `xcresulttool export attachments exited ${String(result.code)}: ${result.stderr.trim()}`,
    };
  }
  const files: string[] = [];
  const hashes: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      files.push(path);
      if (entry.isFile()) {
        hashes[entry.name] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  if (existsSync(input.outDir)) visit(input.outDir);
  return { directory: input.outDir, files: files.sort(), hashes, error: null };
}

/** Prefixed `xcrun xcresulttool` target (same shape as the simctl target). */
export function xcresulttoolTarget(): IosSimctlTarget {
  return { command: "xcrun", prefixArgs: ["xcresulttool"] };
}
