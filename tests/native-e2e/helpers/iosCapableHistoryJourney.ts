/**
 * Test-only orchestration for the B1 CAPABLE-HOST iOS device journey.
 *
 * One run, one owned disposable namespace, one explicitly supplied current
 * server artifact, one explicitly supplied dedicated simulator:
 *
 *   1. pre-boot seed (production DB APIs, via the shared capable-history
 *      fixture) of a GUI thread with a retained canonical prefix and genuine
 *      crash gap evidence;
 *   2. fail-closed ownership gate (explicit UDID + dedicated name + pinned
 *      runtime), then `build-for-testing` and the iOS source-freeze hash gate;
 *   3. boot the real headless host and fail closed unless its descriptor
 *      advertises `runtimeHistoryNotices` v1;
 *   4. hand a production pairing credential to the freshly installed app and
 *      drive the integrated XCUITest
 *      (`ios/App/NativeE2ETests/NativeCapableHistoryJourneyUITests.swift`) (blocked
 *      history -> visible episode notice
 *      and explicit acknowledgement -> BOTH canonical prefix messages -> the
 *      exact live done marker -> reconnect retention);
 *   5. after the acknowledgement is observable on the host, launch the
 *      existing structured ACP stand-in through the production existing-thread
 *      start route so the supervisor produces canonical content;
 *   6. verify the append extended the acknowledged transcript (prefix and
 *      notice retained, no duplicate ids) and require every UI phase marker
 *      from the captured xcodebuild output.
 *
 * The shared crash-gap mechanism, host seams, and structured ACP fixture are
 * reused as-is from the Android capable-history journey: no second gap
 * mechanism, no fault/emit endpoint, and no root `dist` fallback.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CAPABLE_HISTORY_IDS,
  CAPABLE_HISTORY_LIVE_MARKER,
  CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER,
  CAPABLE_HISTORY_PREFIX_MARKER,
  CAPABLE_HISTORY_PREFIX_USER_MARKER,
  CAPABLE_HISTORY_SEED_ARMED_MARKER,
  capableHistoryLiveDoneMarker,
  capableHistoryTurnDoneMarker,
  checkCapableHistoryVerifyResult,
  defaultCapableHistorySeedParams,
} from "./androidCapableHistorySeed.ts";
import {
  redact,
  runCapableHistorySeedFixture,
  runCapableHistoryVerifyFixture,
  runCommand,
  waitForChildClose,
} from "./androidCapableHistoryProcess.ts";
import {
  assertCapableHistoryArtifact,
  capableHistoryJourneyError,
  checkCapableHistoryPostAppend,
  exchangePairingCredential,
  parseEnvironmentDescriptor,
  postThreadRoute,
  readDeclaredHistoryItems,
  readRuntimeGap,
  requireRuntimeHistoryNoticesV1,
  sendThreadInput,
  sha256File,
  startExistingThread,
  type CapableHistoryArtifact,
} from "./androidCapableHistoryHost.ts";
import {
  PINNED_IOS_SIMULATOR_RUNTIME,
  assertIosSimulatorOwnership,
  defaultIosSimctlTarget,
  ensureIosSimulatorBooted,
  readIosAppBundleIdentifier,
  readIosSimulatorIdentity,
  uninstallIosAppForFreshProfile,
  type IosSimctlTarget,
} from "./iosCapableHistorySimulator.ts";
import {
  IOS_CAPABLE_HISTORY_BUILD_CONFIGURATION,
  IOS_CAPABLE_HISTORY_FOREGROUND_READY_MARKER,
  IOS_CAPABLE_HISTORY_PRODUCT_NAME,
  IOS_CAPABLE_HISTORY_SCHEME,
  IOS_CAPABLE_HISTORY_TEST_CLASS,
  IOS_CAPABLE_HISTORY_UI_MARKERS,
  absolutizeIosXctestRoots,
  appBundlePathFor,
  exportXcresultAttachments,
  extractIosJourneyMarkers,
  hashDirectoryTree,
  injectIosXctestEnvironment,
  iosSourceTreeSha256,
  locateGeneratedXctestrun,
  readXcresultSummary,
  xcresulttoolTarget,
} from "./iosCapableHistoryXcode.ts";
import { findRepoRoot } from "../harness/paths.ts";
import {
  launchHeadlessServer,
  pairingTokenFromPairingUrl,
  requestPairingJson,
  stopHeadlessChild,
} from "../harness/realHostProcess.ts";
import { prepareRealHostFixture, trackRealHostPaths } from "../harness/realHostRoot.ts";
import {
  assertPortsFree,
  cleanupRunDirectory,
  createRunDirectory,
  isValidatedRunDirectory,
  portsForSlot,
} from "../harness/runDirectory.ts";
import { ProcessCleanup } from "../harness/processCleanup.ts";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { acpGenericKind } from "@/shared/contracts/agentInstance";
import {
  buildStructuredWorkloadInstance,
  prepareStructuredWorkloadMarkers,
  readSeededStructuredWorkloadInstance,
  resolveStructuredWorkloadParams,
  structuredWorkloadFixtureSha256,
  structuredWorkloadHash,
  waitForStructuredWorkloadExit,
  waitForStructuredWorkloadPid,
  writeStructuredWorkloadSettingsSeed,
} from "./structuredWorkload.ts";

export const IOS_CAPABLE_HISTORY_JOURNEY_GATE_ENV = "IOS_CAPABLE_HISTORY_JOURNEY";
export const IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV = "IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT";
export const IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA256";
export const IOS_CAPABLE_HISTORY_JOURNEY_PORT_ENV = "IOS_CAPABLE_HISTORY_JOURNEY_PORT";
export const IOS_CAPABLE_HISTORY_JOURNEY_OUT_DIR_ENV = "IOS_CAPABLE_HISTORY_JOURNEY_OUT_DIR";
export const IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID";
export const IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME";
export const IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_RUNTIME_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_RUNTIME";
export const IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA256";
export const IOS_CAPABLE_HISTORY_JOURNEY_XCODEBUILD_ENV = "IOS_CAPABLE_HISTORY_JOURNEY_XCODEBUILD";
export const IOS_CAPABLE_HISTORY_JOURNEY_DERIVED_DATA_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_DERIVED_DATA";
export const IOS_CAPABLE_HISTORY_JOURNEY_INTERFACE_STYLE_ENV =
  "IOS_CAPABLE_HISTORY_JOURNEY_INTERFACE_STYLE";

/** Recommended dedicated disposable simulator (create once, run, then delete). */
export const RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME = "Poracode iOS Capable Journey";

/**
 * English notice copy the XCUITest asserts. The runner forces the app's
 * language (`-AppleLanguages (en)`), so these are the rendered values the
 * localization catalogs provide; they are passed to the test as expectations
 * instead of being re-declared in the Swift file.
 */
export const IOS_CAPABLE_HISTORY_EPISODE_TITLE = "History is incomplete";
export const IOS_CAPABLE_HISTORY_DURABLE_TITLE = "Some history is missing";
/** Acknowledgement identifier published by `RichChatNoticeBanner.swift`. */
export const IOS_CAPABLE_HISTORY_ACK_IDENTIFIER = "native-e2e.historyNotice.acknowledge";
/**
 * The client's offline failure band (`RichChatStrings.swift` +
 * `Localizable.xcstrings`). It renders only while the selected host reads
 * offline, and the online-gated authoritative refresh clears it, so its
 * absence after foregrounding is the renewed-online-state assertion.
 */
export const IOS_CAPABLE_HISTORY_OFFLINE_TITLE =
  "Rich chat is unavailable while the desktop is offline.";

/** Slot 6 keeps the iOS journey off the Android journey's default slot 5. */
export const IOS_CAPABLE_HISTORY_DEFAULT_PORT = portsForSlot(6).productionHost;

export interface IosCapableHistoryJourneyInputs {
  readonly repoRoot: string;
  readonly artifact: CapableHistoryArtifact;
  readonly port: number;
  readonly outDir: string;
  /** Explicit dedicated-simulator UDID; no default device selection exists. */
  readonly simulatorUdid: string;
  /** Explicit dedicated-simulator name the UDID must actually report. */
  readonly simulatorName: string;
  readonly simulatorRuntime: string;
  /** sha256 of the frozen iOS source tree (see iosSourceTreeSha256). */
  readonly iosSourceSha256: string;
  readonly xcodebuildPath: string;
  readonly simctl: IosSimctlTarget;
  readonly derivedDataPath: string;
  readonly interfaceStyle: string | null;
}

export function journeyGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[IOS_CAPABLE_HISTORY_JOURNEY_GATE_ENV] === "1";
}

function requireSha256(value: string | undefined, envName: string): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw capableHistoryJourneyError(
      "sha256-required",
      `set ${envName} to the frozen artifact's 64-character sha256`,
    );
  }
  return normalized;
}

/** Resolves the explicit inputs; throws (never falls back) when required ones are absent. */
export function resolveIosCapableHistoryJourneyInputs(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = findRepoRoot(),
): IosCapableHistoryJourneyInputs {
  const entrypoint = env[IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV]?.trim() ?? "";
  if (entrypoint.length === 0) {
    throw capableHistoryJourneyError(
      "entrypoint-required",
      `set ${IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV} to the frozen server bundle`,
    );
  }
  const expectedEntrypointSha256 = requireSha256(
    env[IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV],
    IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV,
  );
  const artifact = assertCapableHistoryArtifact({
    entrypoint,
    expectedEntrypointSha256,
    repoRoot,
  });
  const rawPort = env[IOS_CAPABLE_HISTORY_JOURNEY_PORT_ENV]?.trim();
  const port =
    rawPort === undefined || rawPort === "" ? IOS_CAPABLE_HISTORY_DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw capableHistoryJourneyError("port-invalid", String(rawPort));
  }
  const simulatorUdid = env[IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV]?.trim() ?? "";
  if (simulatorUdid.length === 0) {
    throw capableHistoryJourneyError(
      "simulator-udid-required",
      `set ${IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV} to the dedicated disposable simulator`,
    );
  }
  const simulatorName = env[IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV]?.trim() ?? "";
  if (simulatorName.length === 0) {
    throw capableHistoryJourneyError(
      "simulator-name-required",
      `set ${IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV} to the dedicated simulator's exact name`,
    );
  }
  const iosSourceSha256 = requireSha256(
    env[IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV],
    IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV,
  );
  return {
    repoRoot,
    artifact,
    port,
    outDir:
      env[IOS_CAPABLE_HISTORY_JOURNEY_OUT_DIR_ENV]?.trim() ||
      join(repoRoot, "tmp/v2-production/ios-capable-journey"),
    simulatorUdid,
    simulatorName,
    simulatorRuntime:
      env[IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_RUNTIME_ENV]?.trim() ||
      PINNED_IOS_SIMULATOR_RUNTIME,
    iosSourceSha256,
    xcodebuildPath: env[IOS_CAPABLE_HISTORY_JOURNEY_XCODEBUILD_ENV]?.trim() || "xcodebuild",
    simctl: defaultIosSimctlTarget(),
    derivedDataPath:
      env[IOS_CAPABLE_HISTORY_JOURNEY_DERIVED_DATA_ENV]?.trim() ||
      join(repoRoot, ".tmp/native-e2e/ios-capable-history-derived-data"),
    interfaceStyle: env[IOS_CAPABLE_HISTORY_JOURNEY_INTERFACE_STYLE_ENV]?.trim() || null,
  };
}

// ── The journey ─────────────────────────────────────────────────────────────

export interface IosCapableHistoryJourneyResult {
  readonly runDir: string;
  readonly provenancePath: string;
  readonly iosTestLogPath: string;
}

interface JourneyState {
  launch?: Awaited<ReturnType<typeof launchHeadlessServer>>;
  xcodebuild?: ChildProcess;
  fixturePid?: number;
  devicePairingUrl?: string;
  runnerToken?: string;
  /** Canonical app under test, read from the built bundle. */
  appBundleId?: string;
  /** Ownership verified on the explicit UDID; gates simulator-facing cleanup. */
  deviceVerified?: boolean;
  bootedByRunner?: boolean;
}

async function runCaptured(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}): Promise<{
  readonly code: number | null;
  readonly output: string;
  readonly spawnError: string | null;
}> {
  return await new Promise((resolveRun) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    // Mutable holder: the error arrives from a child-process event callback, so
    // control-flow narrowing on a plain `let` would pin it to `null` here.
    const spawnError: { current: string | null } = { current: null };
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", (error: Error) => {
      spawnError.current ??= error.message;
    });
    child.once("close", (code) => resolveRun({ code, output, spawnError: spawnError.current }));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

/**
 * Waits for one mid-test marker in the captured xcodebuild output. The Swift
 * test prints it only after its phase assertion passed, and the runner uses it
 * as a handshake (drive the post-foreground turn only once the device has
 * proven a renewed online state). A test that exits first is a hard failure.
 */
async function waitForTestOutputMarker(input: {
  readonly output: () => string;
  readonly marker: string;
  readonly exited: () => boolean;
  readonly timeoutMs: number;
  readonly logPath: string;
}): Promise<{ readonly observedAt: string }> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    if (input.output().includes(input.marker)) {
      return { observedAt: new Date().toISOString() };
    }
    if (input.exited()) {
      throw capableHistoryJourneyError(
        "ios-test-exited-before-marker",
        `${input.marker} never appeared (${input.logPath})`,
      );
    }
    await sleep(250);
  }
  throw capableHistoryJourneyError(
    "ios-test-marker-timeout",
    `${input.marker} within ${String(input.timeoutMs)}ms (${input.logPath})`,
  );
}

/**
 * The fixture process writes the prompt marker file with the turn number on
 * every prompt. A `/send` into the live structured session must advance it to
 * the expected turn; a replaced/restarted fixture would write 1 again and this
 * fails closed as a harness precondition (the session must not be replaced).
 */
async function waitForStructuredWorkloadTurn(input: {
  readonly markerPath: string | undefined;
  readonly expectedTurn: number;
  readonly timeoutMs: number;
}): Promise<number> {
  if (!input.markerPath) {
    throw capableHistoryJourneyError(
      "reconnect-prompt-marker-missing",
      "the structured workload params carry no prompt marker path",
    );
  }
  const deadline = Date.now() + input.timeoutMs;
  let observed = "";
  while (Date.now() < deadline) {
    try {
      observed = readFileSync(input.markerPath, "utf8").trim();
    } catch {
      observed = "";
    }
    const turn = Number.parseInt(observed, 10);
    if (Number.isInteger(turn) && turn === input.expectedTurn) return turn;
    await sleep(200);
  }
  throw capableHistoryJourneyError(
    "reconnect-turn-not-distinct",
    `prompt marker ${input.markerPath} is ${observed || "<empty>"}, expected ${String(
      input.expectedTurn,
    )}`,
  );
}

export interface HostConnectionEntry {
  readonly command: string;
  readonly pid: number;
  readonly local: string;
  readonly remote: string | null;
}

/**
 * Host-visible corroboration for the reconnect leg: every established TCP
 * connection touching the host port, sampled over a short window. The iOS
 * simulator shares the host network stack, so the app's renewed live socket is
 * directly observable here (process `App`). Evidence only — the product gates
 * are the device's online-gated failure band and the fresh live marker.
 */
async function sampleHostConnections(input: {
  readonly port: number;
  readonly samples: number;
  readonly intervalMs: number;
}): Promise<
  ReadonlyArray<{ readonly at: string; readonly connections: readonly HostConnectionEntry[] }>
> {
  const linePattern = /^(\S+)\s+(\d+)\s+.*\sTCP\s+(\S+?)(?:->(\S+))?\s+\((\w+)\)$/;
  const samples: Array<{ at: string; connections: HostConnectionEntry[] }> = [];
  for (let index = 0; index < input.samples; index += 1) {
    const result = await runCommand("lsof", [
      "-nP",
      `-iTCP:${String(input.port)}`,
      "-sTCP:ESTABLISHED",
    ]);
    const connections: HostConnectionEntry[] = [];
    for (const line of result.stdout.split("\n").slice(1)) {
      const match = linePattern.exec(line.trim());
      if (!match) continue;
      connections.push({
        command: match[1] as string,
        pid: Number.parseInt(match[2] as string, 10),
        local: match[3] as string,
        remote: match[4] ?? null,
      });
    }
    samples.push({ at: new Date().toISOString(), connections });
    if (index + 1 < input.samples) await sleep(input.intervalMs);
  }
  return samples;
}

export async function runIosCapableHistoryJourney(
  inputs: IosCapableHistoryJourneyInputs,
  options: { readonly keepRunDir?: boolean; readonly testTimeoutMs?: number } = {},
): Promise<IosCapableHistoryJourneyResult> {
  const runDir = createRunDirectory(
    options.keepRunDir !== undefined ? { keep: options.keepRunDir } : {},
  );
  const cleanup = new ProcessCleanup();
  cleanup.attachSignals();
  const state: JourneyState = {};
  const secrets: string[] = [];
  const deviceEvidence: Record<string, unknown> = {
    udid: inputs.simulatorUdid,
    expectedName: inputs.simulatorName,
    expectedRuntime: inputs.simulatorRuntime,
    ownershipVerified: false,
    bootedByRunner: false,
    uninstall: null,
  };
  const provenance: Record<string, unknown> = {
    kind: "ios-capable-history-journey",
    startedAt: new Date().toISOString(),
    gateEnv: IOS_CAPABLE_HISTORY_JOURNEY_GATE_ENV,
    artifact: inputs.artifact,
    hostPort: inputs.port,
    runDir: runDir.path,
    device: deviceEvidence,
    repoHead: (await runCommand("git", ["-C", inputs.repoRoot, "rev-parse", "HEAD"])).stdout.trim(),
    rootDistStatus: (
      await runCommand("git", ["-C", inputs.repoRoot, "status", "--porcelain", "--", "dist"])
    ).stdout.trim(),
  };
  mkdirSync(inputs.outDir, { recursive: true });
  mkdirSync(inputs.derivedDataPath, { recursive: true });

  let iosTestLogPath = join(inputs.outDir, `ios-journey-${String(Date.now())}.log`);
  let testOutput = "";
  const testSpawnError: { current: Error | null } = { current: null };
  let throwable: unknown;
  let runDirValidationProblem: string | null = null;

  try {
    const namespace = join(runDir.path, "poracode-base");
    const fixtureDir = await prepareRealHostFixture(namespace);
    trackRealHostPaths(namespace, cleanup);
    const poracodePaths = resolvePoracodePaths(resolveHostRootPaths(namespace).dataRoot);

    const markers = prepareStructuredWorkloadMarkers(runDir.path);
    const fixtureParams = resolveStructuredWorkloadParams({
      marker: CAPABLE_HISTORY_LIVE_MARKER,
      thoughtChunks: 0,
      textChunks: 4,
      toolCalls: 0,
      chunkBytes: 64,
      ratePerSec: 25,
      durationMs: 30_000,
      selfDestructMs: 0,
      resumeCapability: true,
      models: ["structured-load-model"],
      promptMarkerPath: markers.promptMarkerPath,
      cancelMarkerPath: markers.cancelMarkerPath,
      readyMarkerPath: markers.readyMarkerPath,
      exitMarkerPath: markers.exitMarkerPath,
    });
    const instance = buildStructuredWorkloadInstance(fixtureParams, CAPABLE_HISTORY_IDS.instanceId);
    const settingsPath = poracodePaths.settingsPath;
    writeStructuredWorkloadSettingsSeed({ settingsPath, instance });

    const seedParams = defaultCapableHistorySeedParams({
      projectPath: fixtureDir,
      model: "structured-load-model",
    });
    const fixturePath = resolve(
      inputs.repoRoot,
      "tests/native-e2e/fixtures/android-capable-history-seed.ts",
    );
    const seedOutput = await runCapableHistorySeedFixture({
      repoRoot: inputs.repoRoot,
      fixturePath,
      dbPath: poracodePaths.dbPath,
      params: seedParams,
    });
    const verified = await runCapableHistoryVerifyFixture({
      repoRoot: inputs.repoRoot,
      fixturePath,
      dbPath: poracodePaths.dbPath,
      params: seedParams,
    });
    const seedProblems = checkCapableHistoryVerifyResult(verified, seedParams);
    if (seedProblems.length > 0) {
      throw capableHistoryJourneyError("seed-verification-failed", seedProblems.join("; "));
    }
    provenance.seed = {
      armedLine: seedOutput
        .split("\n")
        .find((line) => line.includes(CAPABLE_HISTORY_SEED_ARMED_MARKER)),
      verified,
      fixtureSha256: sha256File(fixturePath),
      structuredFixtureSha256: structuredWorkloadFixtureSha256(),
      structuredParamsHash: structuredWorkloadHash(fixtureParams),
      settingsSha256: sha256File(settingsPath),
    };

    // Ownership gate (read-only identity first): no build output is touched on
    // a wrong target, and the app under test is only cleared after this passes.
    const simulatorIdentity = await readIosSimulatorIdentity({
      target: inputs.simctl,
      udid: inputs.simulatorUdid,
    });
    Object.assign(deviceEvidence, simulatorIdentity);
    assertIosSimulatorOwnership({
      identity: simulatorIdentity,
      expectedName: inputs.simulatorName,
      expectedRuntime: inputs.simulatorRuntime,
    });
    deviceEvidence.ownershipVerified = true;
    state.deviceVerified = true;

    // Source-freeze gate before the (expensive, non-reproducible) app build.
    const sourceHash = iosSourceTreeSha256(inputs.repoRoot);
    provenance.iosSource = {
      ...sourceHash,
      expectedSha256: inputs.iosSourceSha256,
      matchesExpected: sourceHash.sha256 === inputs.iosSourceSha256,
    };
    if (sourceHash.sha256 !== inputs.iosSourceSha256) {
      throw capableHistoryJourneyError(
        "ios-source-hash-mismatch",
        `iOS source tree hashes to ${sourceHash.sha256} over ${String(sourceHash.fileCount)} files, ` +
          `expected ${inputs.iosSourceSha256}; review the diff and re-pin after the freeze`,
      );
    }

    const buildLogPath = join(inputs.outDir, `ios-build-${String(Date.now())}.log`);
    const build = await runCaptured({
      command: inputs.xcodebuildPath,
      args: [
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        IOS_CAPABLE_HISTORY_SCHEME,
        "-configuration",
        IOS_CAPABLE_HISTORY_BUILD_CONFIGURATION,
        "-destination",
        `platform=iOS Simulator,id=${inputs.simulatorUdid}`,
        "-derivedDataPath",
        inputs.derivedDataPath,
        "build-for-testing",
      ],
      cwd: inputs.repoRoot,
    });
    writeFileSync(buildLogPath, redact(build.output, secrets), { mode: 0o600 });
    if (build.spawnError !== null || build.code !== 0) {
      throw capableHistoryJourneyError(
        "ios-build-failed",
        `build-for-testing exited ${String(build.code)} (${buildLogPath})` +
          (build.spawnError ? `: ${build.spawnError}` : ""),
      );
    }
    const productsDir = join(inputs.derivedDataPath, "Build", "Products");
    const appBundlePath = appBundlePathFor(productsDir, IOS_CAPABLE_HISTORY_PRODUCT_NAME);
    const appBundleId = await readIosAppBundleIdentifier({ appBundlePath });
    state.appBundleId = appBundleId;
    const xctestrunPath = locateGeneratedXctestrun(productsDir);
    const appBundleHash = hashDirectoryTree(appBundlePath, { includeSymlinks: true });
    provenance.iosBuild = {
      derivedDataPath: inputs.derivedDataPath,
      buildLogPath,
      buildLogSha256: sha256File(buildLogPath),
      appBundlePath,
      appBundleId,
      appBundleSha256: appBundleHash.sha256,
      appBundleFileCount: appBundleHash.fileCount,
      xctestrunPath,
      xctestrunSha256: sha256File(xctestrunPath),
    };

    const boot = await ensureIosSimulatorBooted({
      target: inputs.simctl,
      identity: simulatorIdentity,
    });
    state.bootedByRunner = boot.bootedByRunner;
    deviceEvidence.bootedByRunner = boot.bootedByRunner;
    deviceEvidence.boot = {
      stateBefore: boot.stateBefore,
      bootedByRunner: boot.bootedByRunner,
    };

    // Fresh-pair state: uninstall the disposable app so the test build installs
    // it clean and the journey always starts on onboarding. Ownership verified.
    const uninstall = await uninstallIosAppForFreshProfile({
      target: inputs.simctl,
      udid: inputs.simulatorUdid,
      bundleId: appBundleId,
    });
    deviceEvidence.uninstall = {
      bundleId: appBundleId,
      skipped: uninstall.skipped,
      installedBefore: uninstall.installedBefore,
      exitCode: uninstall.result?.code ?? null,
      stdout: uninstall.result?.stdout.trim() ?? null,
      stderr: uninstall.result?.stderr.trim() ?? null,
      success: uninstall.success,
    };
    if (!uninstall.success) {
      throw capableHistoryJourneyError(
        "simulator-uninstall-failed",
        `simctl uninstall ${appBundleId} exited ${String(uninstall.result?.code)}`,
      );
    }

    try {
      await assertPortsFree([inputs.port]);
      provenance.portPreflight = { host: "127.0.0.1", port: inputs.port, free: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      provenance.portPreflight = {
        host: "127.0.0.1",
        port: inputs.port,
        free: false,
        error: message,
      };
      throw capableHistoryJourneyError("host-port-not-free", message);
    }

    delete process.env.PORACODE_MOCK_AGENTS;
    const launch = await launchHeadlessServer({
      host: "127.0.0.1",
      port: inputs.port,
      repoRoot: inputs.repoRoot,
      entrypoint: inputs.artifact.entrypoint,
      profileNamespace: namespace,
      cleanup,
    });
    state.launch = launch;

    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", launch.httpBaseUrl),
    );
    if (!descriptorResponse.ok) {
      throw capableHistoryJourneyError(
        "descriptor-unavailable",
        `HTTP ${String(descriptorResponse.status)}`,
      );
    }
    const descriptor = parseEnvironmentDescriptor(await descriptorResponse.json());
    const capability = requireRuntimeHistoryNoticesV1(descriptor);
    provenance.descriptor = {
      protocolVersion: descriptor.protocolVersion,
      appVersion: descriptor.appVersion,
      hostMode: descriptor.hostMode,
      runtimeHistoryNotices: capability,
    };
    provenance.structuredInstance = {
      instanceId: CAPABLE_HISTORY_IDS.instanceId,
      agentKind: acpGenericKind(CAPABLE_HISTORY_IDS.instanceId),
      onDiskInstance: readSeededStructuredWorkloadInstance({
        settingsPath,
        instanceId: CAPABLE_HISTORY_IDS.instanceId,
      }),
      settingsPath,
    };

    const devicePairing = await requestPairingJson(
      inputs.artifact.entrypoint,
      namespace,
      inputs.repoRoot,
      launch.env,
    );
    state.devicePairingUrl = devicePairing.pairingUrl;
    secrets.push(devicePairing.pairingUrl);
    const deviceToken = pairingTokenFromPairingUrl(devicePairing.pairingUrl);
    if (deviceToken) secrets.push(deviceToken);
    const runnerPairing = await requestPairingJson(
      inputs.artifact.entrypoint,
      namespace,
      inputs.repoRoot,
      launch.env,
    );
    const runnerToken = await exchangePairingCredential({
      httpBaseUrl: launch.httpBaseUrl,
      pairingUrl: runnerPairing.pairingUrl,
      scopes: ["session:read", "session:operate"],
      label: "ios-capable-history-journey-runner",
    });
    state.runnerToken = runnerToken;
    secrets.push(runnerToken);

    // Pre-ack host truth: a capable host with a real durable gap refuses the
    // fenced declared read and reports the suspect descriptor.
    const preGap = await readRuntimeGap({
      httpBaseUrl: launch.httpBaseUrl,
      accessToken: runnerToken,
      threadId: seedParams.threadId,
    });
    if (
      preGap.status !== 200 ||
      preGap.body?.gap?.source !== "suspect" ||
      preGap.body.gap.reason !== "unclean-epoch" ||
      preGap.body.notice !== null
    ) {
      throw capableHistoryJourneyError("precondition-gap-mismatch", JSON.stringify(preGap.body));
    }
    const preRead = await readDeclaredHistoryItems({
      httpBaseUrl: launch.httpBaseUrl,
      accessToken: runnerToken,
      threadId: seedParams.threadId,
    });
    if (preRead.status !== 503 || preRead.errorCode !== "persistence_contaminated") {
      throw capableHistoryJourneyError(
        "precondition-read-not-refused",
        `status=${String(preRead.status)} code=${String(preRead.errorCode)}`,
      );
    }
    provenance.preAck = {
      gap: preGap.body,
      historyItems: { status: preRead.status, errorCode: preRead.errorCode },
    };

    const generatedXctestrun = readFileSync(xctestrunPath, "utf8");
    const injected = absolutizeIosXctestRoots(
      injectIosXctestEnvironment(generatedXctestrun, {
        IOS_CAPABLE_HISTORY_RUN_ID: runDir.path.split("/").at(-1) ?? "ios-capable-history",
        IOS_CAPABLE_HISTORY_PAIRING_URL: devicePairing.pairingUrl,
        IOS_CAPABLE_HISTORY_THREAD_ID: seedParams.threadId,
        IOS_CAPABLE_HISTORY_THREAD_TITLE: seedParams.threadTitle,
        IOS_CAPABLE_HISTORY_USER_MARKER: CAPABLE_HISTORY_PREFIX_USER_MARKER,
        IOS_CAPABLE_HISTORY_ASSISTANT_MARKER: CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER,
        IOS_CAPABLE_HISTORY_LIVE_MARKER: capableHistoryLiveDoneMarker(),
        IOS_CAPABLE_HISTORY_RECONNECT_MARKER: capableHistoryTurnDoneMarker(2),
        IOS_CAPABLE_HISTORY_EPISODE_TITLE: IOS_CAPABLE_HISTORY_EPISODE_TITLE,
        IOS_CAPABLE_HISTORY_DURABLE_TITLE: IOS_CAPABLE_HISTORY_DURABLE_TITLE,
        IOS_CAPABLE_HISTORY_ACK_IDENTIFIER: IOS_CAPABLE_HISTORY_ACK_IDENTIFIER,
        IOS_CAPABLE_HISTORY_OFFLINE_TITLE: IOS_CAPABLE_HISTORY_OFFLINE_TITLE,
        ...(inputs.interfaceStyle === null
          ? {}
          : { IOS_CAPABLE_HISTORY_INTERFACE_STYLE: inputs.interfaceStyle }),
      }),
      { productsDir, derivedDataPath: inputs.derivedDataPath },
    );
    const injectedXctestrunPath = join(runDir.path, "ios-capable-history.xctestrun");
    writeFileSync(injectedXctestrunPath, injected, { mode: 0o600 });
    const resultBundlePath = join(runDir.path, "ios-capable-history.xcresult");

    // The injected xctestrun carries the one-time pairing URL; it lives only in
    // the 0o700 run directory (removed unless the operator keeps the run).
    iosTestLogPath = join(inputs.outDir, `ios-journey-${String(Date.now())}.log`);
    const xcodebuild = spawn(
      inputs.xcodebuildPath,
      [
        "-xctestrun",
        injectedXctestrunPath,
        "-destination",
        `platform=iOS Simulator,id=${inputs.simulatorUdid}`,
        "-resultBundlePath",
        resultBundlePath,
        `-only-testing:NativeE2ETests/${IOS_CAPABLE_HISTORY_TEST_CLASS}`,
        "test-without-building",
      ],
      { cwd: inputs.repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    state.xcodebuild = xcodebuild;
    cleanup.trackChild(xcodebuild);
    xcodebuild.on("error", (error: Error) => {
      testSpawnError.current ??= error;
    });
    xcodebuild.stdout?.on("data", (chunk: Buffer) => {
      testOutput += chunk.toString("utf8");
    });
    xcodebuild.stderr?.on("data", (chunk: Buffer) => {
      testOutput += chunk.toString("utf8");
    });

    // Wait until the device's explicit acknowledgement is durable on the host:
    // the notice becomes readable through the same declared route the app uses.
    const ackDeadline = Date.now() + 300_000;
    let acknowledged = false;
    while (Date.now() < ackDeadline) {
      if (testSpawnError.current) {
        throw capableHistoryJourneyError("ios-test-spawn-failed", testSpawnError.current.message);
      }
      const read = await readDeclaredHistoryItems({
        httpBaseUrl: launch.httpBaseUrl,
        accessToken: runnerToken,
        threadId: seedParams.threadId,
      });
      if (read.status === 200 && read.notice?.kind === "history-incomplete") {
        provenance.postAck = {
          status: read.status,
          notice: read.notice,
          prefixItemIds: read.items
            .map((item) => (typeof item["id"] === "string" ? item["id"] : ""))
            .filter((id) => id.length > 0),
        };
        acknowledged = true;
        break;
      }
      if (xcodebuild.exitCode !== null) {
        throw capableHistoryJourneyError(
          "ios-test-exited-before-ack",
          `exit=${String(xcodebuild.exitCode)} (${iosTestLogPath})`,
        );
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    if (!acknowledged) {
      throw capableHistoryJourneyError("ack-not-observed", "300s deadline");
    }

    // Post-ack supervisor-originated append through the production existing
    // thread start route; the IPC fixture is the only reachable structured
    // child (real acp-generic adapter, no model/network credentials).
    const start = await startExistingThread({
      httpBaseUrl: launch.httpBaseUrl,
      accessToken: runnerToken,
      threadId: seedParams.threadId,
      projectLocation: { kind: "posix", path: fixtureDir },
      agentKind: acpGenericKind(CAPABLE_HISTORY_IDS.instanceId),
      agentInstanceId: CAPABLE_HISTORY_IDS.instanceId,
      config: { model: "structured-load-model" },
      prompt: "[chj-live-prompt] structured fixture append for the capable-history journey",
      commandId: `ios-capable-history-start-${randomUUID()}`,
    });
    if (start.status !== 200) {
      throw capableHistoryJourneyError(
        "fixture-start-failed",
        `status=${String(start.status)} code=${String(start.errorCode)}`,
      );
    }
    state.fixturePid = await waitForStructuredWorkloadPid({
      markerPath: markers.readyMarkerPath,
      timeoutMs: 60_000,
    });

    const appendDeadline = Date.now() + 180_000;
    let appendEvidence: ReturnType<typeof checkCapableHistoryPostAppend> | null = null;
    while (Date.now() < appendDeadline) {
      const read = await readDeclaredHistoryItems({
        httpBaseUrl: launch.httpBaseUrl,
        accessToken: runnerToken,
        threadId: seedParams.threadId,
      });
      if (read.status === 200) {
        appendEvidence = checkCapableHistoryPostAppend({
          items: read.items,
          notice: read.notice,
          prefix: {
            userItemId: seedParams.userItemId,
            assistantItemId: seedParams.assistantItemId,
          },
          prefixMarkers: [CAPABLE_HISTORY_PREFIX_MARKER],
          liveMarker: capableHistoryLiveDoneMarker(),
        });
        if (appendEvidence.problems.length === 0) break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    if (!appendEvidence || appendEvidence.problems.length > 0) {
      throw capableHistoryJourneyError(
        "post-append-invariants-failed",
        (appendEvidence?.problems ?? ["no post-append read succeeded"]).join("; "),
      );
    }
    provenance.postAppend = appendEvidence.evidence;
    provenance.fixture = {
      pid: state.fixturePid,
      params: fixtureParams,
      paramsHash: structuredWorkloadHash(fixtureParams),
      readyMarker: markers.readyMarkerPath,
      promptMarker: markers.promptMarkerPath,
    };

    // ── Reconnect leg ───────────────────────────────────────────────────────
    // The device must first prove an actual renewed online state (its
    // online-gated refresh cleared the offline failure band). Only then is one
    // more controlled ACP turn driven through the existing live structured
    // session, so the fresh marker the device renders cannot pre-exist the
    // reconnect. `/send` (not a second `/start`) keeps the live session: a
    // replacement would respawn the fixture and reset its turn counter.
    const foregroundReady = await waitForTestOutputMarker({
      output: () => testOutput,
      marker: IOS_CAPABLE_HISTORY_FOREGROUND_READY_MARKER,
      exited: () => xcodebuild.exitCode !== null,
      timeoutMs: 420_000,
      logPath: iosTestLogPath,
    });
    const connectionSamples = await sampleHostConnections({
      port: inputs.port,
      samples: 6,
      intervalMs: 500,
    });
    const reconnectMarker = capableHistoryTurnDoneMarker(2);
    const reconnectSend = await sendThreadInput({
      httpBaseUrl: launch.httpBaseUrl,
      accessToken: runnerToken,
      threadId: seedParams.threadId,
      config: { model: "structured-load-model" },
      prompt: "[chj-r2-prompt] post-foreground structured fixture append",
      commandId: `ios-capable-history-reconnect-${randomUUID()}`,
    });
    if (reconnectSend.status !== 200) {
      throw capableHistoryJourneyError(
        "reconnect-send-failed",
        `status=${String(reconnectSend.status)} code=${String(reconnectSend.errorCode)}`,
      );
    }
    const reconnectTurn = await waitForStructuredWorkloadTurn({
      markerPath: markers.promptMarkerPath,
      expectedTurn: 2,
      timeoutMs: 60_000,
    });

    const reconnectDeadline = Date.now() + 180_000;
    let reconnectEvidence: ReturnType<typeof checkCapableHistoryPostAppend> | null = null;
    while (Date.now() < reconnectDeadline) {
      const read = await readDeclaredHistoryItems({
        httpBaseUrl: launch.httpBaseUrl,
        accessToken: runnerToken,
        threadId: seedParams.threadId,
      });
      if (read.status === 200) {
        reconnectEvidence = checkCapableHistoryPostAppend({
          items: read.items,
          notice: read.notice,
          prefix: {
            userItemId: seedParams.userItemId,
            assistantItemId: seedParams.assistantItemId,
          },
          prefixMarkers: [CAPABLE_HISTORY_PREFIX_MARKER],
          liveMarker: reconnectMarker,
        });
        if (reconnectEvidence.problems.length === 0) break;
      }
      await sleep(500);
    }
    if (!reconnectEvidence || reconnectEvidence.problems.length > 0) {
      throw capableHistoryJourneyError(
        "reconnect-append-invariants-failed",
        (reconnectEvidence?.problems ?? ["no post-reconnect read succeeded"]).join("; "),
      );
    }
    provenance.reconnect = {
      foregroundReadyAt: foregroundReady.observedAt,
      hostPort: inputs.port,
      connectionSamples,
      send: { status: reconnectSend.status, errorCode: reconnectSend.errorCode },
      promptTurn: reconnectTurn,
      liveMarker: reconnectMarker,
      append: reconnectEvidence.evidence,
    };

    const timeoutMs = options.testTimeoutMs ?? 900_000;
    const testExit = await Promise.race([
      waitForChildClose(xcodebuild),
      new Promise<null>((resolveWait) => {
        setTimeout(() => resolveWait(null), timeoutMs).unref?.();
      }),
    ]);
    if (testSpawnError.current) {
      throw capableHistoryJourneyError("ios-test-spawn-failed", testSpawnError.current.message);
    }
    if (testExit === null) {
      throw capableHistoryJourneyError("ios-test-timeout", `${String(timeoutMs)}ms`);
    }
    const redacted = redact(testOutput, secrets);
    writeFileSync(iosTestLogPath, redacted, { mode: 0o600 });
    const markersResult = extractIosJourneyMarkers(redacted, IOS_CAPABLE_HISTORY_UI_MARKERS);
    const summary = existsSync(resultBundlePath)
      ? await readXcresultSummary({
          target: xcresulttoolTarget(),
          resultBundlePath,
        })
      : {
          ok: false,
          result: null,
          passedTests: null,
          failedTests: null,
          skippedTests: null,
          raw: "",
          error: "result bundle missing",
        };
    provenance.iosTest = {
      class: IOS_CAPABLE_HISTORY_TEST_CLASS,
      exit: testExit,
      logPath: iosTestLogPath,
      logSha256: sha256File(iosTestLogPath),
      uiMarkers: markersResult,
      resultBundlePath,
      summary,
    };
    if (testExit !== 0) {
      throw capableHistoryJourneyError(
        "ios-test-failed",
        `test-without-building exited ${String(testExit)} (${iosTestLogPath})`,
      );
    }
    if (!summary.ok) {
      throw capableHistoryJourneyError(
        "ios-test-summary-not-passed",
        summary.error ?? `result=${String(summary.result)} failed=${String(summary.failedTests)}`,
      );
    }
    if (markersResult.missing.length > 0) {
      throw capableHistoryJourneyError("ios-test-marker-missing", markersResult.missing.join(", "));
    }
    if (deviceToken !== null && redacted.includes(deviceToken)) {
      throw capableHistoryJourneyError("pairing-token-leaked-to-log", iosTestLogPath);
    }
    provenance.finishedAt = new Date().toISOString();
  } catch (error) {
    throwable = error;
    if (testSpawnError.current) provenance.testSpawnError = testSpawnError.current.message;
    if (testOutput.length > 0) {
      writeFileSync(iosTestLogPath, redact(testOutput, secrets), { mode: 0o600 });
      provenance.iosTest = {
        logPath: iosTestLogPath,
        logSha256: sha256File(iosTestLogPath),
        failed: true,
      };
    }
  } finally {
    const cleanupEvidence: Record<string, unknown> = {};
    const resultBundlePath = join(runDir.path, "ios-capable-history.xcresult");
    if (existsSync(resultBundlePath)) {
      try {
        cleanupEvidence.attachments = await exportXcresultAttachments({
          target: xcresulttoolTarget(),
          resultBundlePath,
          outDir: join(inputs.outDir, "screenshots", runDir.path.split("/").at(-1) ?? "run"),
        });
      } catch (error) {
        cleanupEvidence.attachmentError = error instanceof Error ? error.message : String(error);
      }
    } else {
      cleanupEvidence.attachments = { skipped: "result bundle absent" };
    }
    if (state.launch && state.runnerToken) {
      try {
        cleanupEvidence.closeThread = await postThreadRoute({
          httpBaseUrl: state.launch.httpBaseUrl,
          accessToken: state.runnerToken,
          threadId: CAPABLE_HISTORY_IDS.threadId,
          route: "close",
        });
      } catch (error) {
        cleanupEvidence.closeThreadError = error instanceof Error ? error.message : String(error);
      }
    }
    if (state.fixturePid !== undefined) {
      try {
        cleanupEvidence.fixtureExit = await waitForStructuredWorkloadExit({
          pid: state.fixturePid,
          timeoutMs: 20_000,
        });
      } catch (error) {
        cleanupEvidence.fixtureExitError = error instanceof Error ? error.message : String(error);
        try {
          process.kill(state.fixturePid, "SIGKILL");
        } catch {
          // Already gone.
        }
      }
    }
    if (state.xcodebuild && state.xcodebuild.exitCode === null) {
      state.xcodebuild.kill("SIGKILL");
    }
    if (state.deviceVerified && state.appBundleId) {
      try {
        const terminate = await runCommand(inputs.simctl.command, [
          ...inputs.simctl.prefixArgs,
          "terminate",
          inputs.simulatorUdid,
          state.appBundleId,
        ]);
        cleanupEvidence.appTerminated = {
          bundleId: state.appBundleId,
          exitCode: terminate.code,
          stderr: terminate.stderr.trim(),
        };
      } catch (error) {
        cleanupEvidence.appTerminateError = error instanceof Error ? error.message : String(error);
      }
    }
    if (state.launch) {
      try {
        await stopHeadlessChild(state.launch.child);
        cleanupEvidence.hostStopped = true;
      } catch (error) {
        cleanupEvidence.hostStopError = error instanceof Error ? error.message : String(error);
      }
    }
    if (state.deviceVerified && state.bootedByRunner) {
      try {
        const shutdown = await runCommand(inputs.simctl.command, [
          ...inputs.simctl.prefixArgs,
          "shutdown",
          inputs.simulatorUdid,
        ]);
        cleanupEvidence.simulatorShutdown = {
          exitCode: shutdown.code,
          stdout: shutdown.stdout.trim(),
          stderr: shutdown.stderr.trim(),
        };
      } catch (error) {
        cleanupEvidence.simulatorShutdownError =
          error instanceof Error ? error.message : String(error);
      }
    } else {
      cleanupEvidence.simulatorShutdown = { skipped: state.bootedByRunner !== true };
    }
    await cleanup.shutdown("ios-capable-history-journey");
    cleanupEvidence.runDirValidated = isValidatedRunDirectory(runDir.path, inputs.repoRoot);
    provenance.cleanup = cleanupEvidence;
    provenance.secrets = {
      devicePairingMinted: state.devicePairingUrl !== undefined,
      runnerCredentialMinted: state.runnerToken !== undefined,
    };
    const provenancePath = join(inputs.outDir, "provenance.json");
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
    if (cleanupEvidence.runDirValidated !== true) {
      runDirValidationProblem = `run dir ${runDir.path} failed marker validation`;
    } else {
      cleanupRunDirectory(
        runDir.path,
        options.keepRunDir !== undefined ? { keep: options.keepRunDir } : {},
      );
    }
  }

  if (throwable !== undefined) {
    throw throwable instanceof Error
      ? throwable
      : capableHistoryJourneyError("journey-failed", String(throwable));
  }
  if (runDirValidationProblem !== null) {
    throw capableHistoryJourneyError("run-dir-not-validated", runDirValidationProblem);
  }
  return {
    runDir: runDir.path,
    provenancePath: join(inputs.outDir, "provenance.json"),
    iosTestLogPath,
  };
}
