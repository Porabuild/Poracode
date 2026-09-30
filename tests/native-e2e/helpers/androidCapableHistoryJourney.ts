/**
 * Test-only orchestration for the B1 CAPABLE-HOST Android device journey.
 *
 * One run, one owned disposable namespace, one explicitly supplied current
 * server artifact, one explicitly supplied dedicated emulator:
 *
 *   1. pre-boot seed (production DB APIs) of a GUI thread with a retained
 *      canonical prefix and genuine crash gap evidence;
 *   2. fail-closed device ownership gate (explicit serial + dedicated AVD +
 *      installed canonical app/instrumentation) and a free-port preflight;
 *   3. boot the real headless host and fail closed unless its descriptor
 *      advertises `runtimeHistoryNotices` v1;
 *   4. hand a production pairing credential to the real Android client and
 *      drive the instrumented UI journey (failed history -> visible action ->
 *      explicit acknowledgement -> retained prefix + notice);
 *   5. after the acknowledgement is observable on the host, launch the
 *      existing structured ACP stand-in through the production existing-thread
 *      start route so the supervisor produces canonical content;
 *   6. verify the append extended the acknowledged transcript (prefix and
 *      notice retained, no duplicate ids) and let the client assert the
 *      reconnect leg.
 *
 * Every precondition and postcondition is checked through public production
 * surfaces. The root `dist` output is refused by path and by hash, a host
 * without the capability is a hard failure rather than a false==false pass,
 * and no device mutation happens before ownership is verified.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CAPABLE_HISTORY_IDS,
  CAPABLE_HISTORY_LIVE_MARKER,
  CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER,
  CAPABLE_HISTORY_PREFIX_MARKER,
  CAPABLE_HISTORY_PREFIX_USER_MARKER,
  CAPABLE_HISTORY_SEED_ARMED_MARKER,
  capableHistoryLiveDoneMarker,
  checkCapableHistoryVerifyResult,
  defaultCapableHistorySeedParams,
} from "./androidCapableHistorySeed.ts";
import {
  adbArgs,
  adbShellLiteral,
  assertCapableHistoryDeviceOwnership,
  capableHistoryClearSucceeded,
  pullCapableHistoryScreenshots,
  readCanonicalAndroidAppId,
  readCapableHistoryDeviceIdentity,
  redact,
  runAdb,
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
  sha256File,
  startExistingThread,
  type CapableHistoryArtifact,
} from "./androidCapableHistoryHost.ts";
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

export const CAPABLE_HISTORY_JOURNEY_GATE_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY";
export const CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT";
export const CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV =
  "ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA256";
export const CAPABLE_HISTORY_JOURNEY_PORT_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_PORT";
export const CAPABLE_HISTORY_JOURNEY_OUT_DIR_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_OUT_DIR";
export const CAPABLE_HISTORY_JOURNEY_ADB_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_ADB";
export const CAPABLE_HISTORY_JOURNEY_SERIAL_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_SERIAL";
export const CAPABLE_HISTORY_JOURNEY_AVD_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_AVD";
export const CAPABLE_HISTORY_JOURNEY_APP_ID_ENV = "ANDROID_CAPABLE_HISTORY_JOURNEY_APP_ID";

export const CAPABLE_HISTORY_INSTRUMENTATION_CLASS =
  "com.poracode.app.Android37CapableHistoryJourneyInstrumentedTest";
export const DEFAULT_CAPABLE_HISTORY_APP_ID = "com.lightcodeapp.mobile";
export const DEFAULT_CAPABLE_HISTORY_RUNNER = "androidx.test.runner.AndroidJUnitRunner";

/** Instrumentation lines the runner requires before it will call a run green. */
export const REQUIRED_CAPABLE_HISTORY_UI_MARKERS = [
  "CAPABLE_HISTORY_UI_CAPABLE",
  "CAPABLE_HISTORY_UI_DESCRIPTOR",
  "CAPABLE_HISTORY_UI_ACK_TAPPED",
  "CAPABLE_HISTORY_UI_PREFIX_VISIBLE",
  "CAPABLE_HISTORY_UI_NOTICE_RETAINED",
  "CAPABLE_HISTORY_UI_LIVE_VISIBLE",
  "CAPABLE_HISTORY_UI_RECONNECT_RETAINED",
] as const;

export interface CapableHistoryJourneyInputs {
  readonly repoRoot: string;
  readonly artifact: CapableHistoryArtifact;
  readonly port: number;
  readonly outDir: string;
  readonly adbPath: string;
  /** Explicit dedicated-emulator serial; adb default selection is refused. */
  readonly serial: string;
  /** Explicit dedicated AVD name the serial must actually report. */
  readonly expectedAvd: string;
  readonly appId: string;
  /** Application id pinned by `android/app/build.gradle.kts`. */
  readonly canonicalAppId: string;
  readonly instrumentationClass: string;
  readonly runnerComponent: string;
}

export function journeyGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CAPABLE_HISTORY_JOURNEY_GATE_ENV] === "1";
}

/** Resolves the explicit inputs; throws (never falls back) when required ones are absent. */
export function resolveCapableHistoryJourneyInputs(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = findRepoRoot(),
): CapableHistoryJourneyInputs {
  const artifact = assertCapableHistoryArtifact({
    entrypoint: env[CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV] ?? "",
    expectedEntrypointSha256: env[CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV] ?? "",
    repoRoot,
  });
  const rawPort = env[CAPABLE_HISTORY_JOURNEY_PORT_ENV]?.trim();
  const port =
    rawPort === undefined || rawPort === "" ? portsForSlot(5).productionHost : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw capableHistoryJourneyError("port-invalid", String(rawPort));
  }
  const appId = env[CAPABLE_HISTORY_JOURNEY_APP_ID_ENV]?.trim() || DEFAULT_CAPABLE_HISTORY_APP_ID;
  const canonicalAppId = readCanonicalAndroidAppId(repoRoot);
  if (appId !== canonicalAppId) {
    throw capableHistoryJourneyError(
      "app-id-not-canonical",
      `ANDROID_CAPABLE_HISTORY_JOURNEY_APP_ID=${appId} is not the canonical app under test ${canonicalAppId}; refusing an override that could clear an unrelated package`,
    );
  }
  const serial = env[CAPABLE_HISTORY_JOURNEY_SERIAL_ENV]?.trim() ?? "";
  if (serial.length === 0) {
    throw capableHistoryJourneyError(
      "serial-required",
      "set ANDROID_CAPABLE_HISTORY_JOURNEY_SERIAL to the dedicated emulator serial; adb default selection (possibly a personal phone) is refused",
    );
  }
  const expectedAvd = env[CAPABLE_HISTORY_JOURNEY_AVD_ENV]?.trim() ?? "";
  if (expectedAvd.length === 0) {
    throw capableHistoryJourneyError(
      "avd-required",
      "set ANDROID_CAPABLE_HISTORY_JOURNEY_AVD to the dedicated disposable AVD the serial must report",
    );
  }
  return {
    repoRoot,
    artifact,
    port,
    outDir:
      env[CAPABLE_HISTORY_JOURNEY_OUT_DIR_ENV]?.trim() ||
      join(repoRoot, "tmp/v2-production/android-capable-history-journey"),
    adbPath: env[CAPABLE_HISTORY_JOURNEY_ADB_ENV]?.trim() || "adb",
    serial,
    expectedAvd,
    appId,
    canonicalAppId,
    instrumentationClass: CAPABLE_HISTORY_INSTRUMENTATION_CLASS,
    runnerComponent: `${appId}.test/${DEFAULT_CAPABLE_HISTORY_RUNNER}`,
  };
}

// ── The journey ─────────────────────────────────────────────────────────────

export interface CapableHistoryJourneyResult {
  readonly runDir: string;
  readonly provenancePath: string;
  readonly instrumentationLogPath: string;
}

interface JourneyState {
  launch?: Awaited<ReturnType<typeof launchHeadlessServer>>;
  instrumentation?: ChildProcess;
  fixturePid?: number;
  devicePairingUrl?: string;
  runnerToken?: string;
  /** Ownership verified on the explicit serial; gates device-facing cleanup. */
  deviceVerified?: boolean;
  /** `adb reverse` was installed; only then may cleanup remove it. */
  reverseAdded?: boolean;
}

export async function runCapableHistoryJourney(
  inputs: CapableHistoryJourneyInputs,
  options: { readonly keepRunDir?: boolean; readonly instrumentationTimeoutMs?: number } = {},
): Promise<CapableHistoryJourneyResult> {
  const runDir = createRunDirectory(
    options.keepRunDir !== undefined ? { keep: options.keepRunDir } : {},
  );
  const cleanup = new ProcessCleanup();
  cleanup.attachSignals();
  const state: JourneyState = {};
  const secrets: string[] = [];
  // Device identity is recorded before any device contact and mutated as the
  // read-only fingerprint, ownership assertion and clear result are produced,
  // so provenance names the target on failure paths too.
  const deviceEvidence: Record<string, unknown> = {
    serial: inputs.serial,
    expectedAvd: inputs.expectedAvd,
    appId: inputs.appId,
    canonicalAppId: inputs.canonicalAppId,
    ownershipVerified: false,
    clear: null,
  };
  const provenance: Record<string, unknown> = {
    kind: "android-capable-history-journey",
    startedAt: new Date().toISOString(),
    gateEnv: CAPABLE_HISTORY_JOURNEY_GATE_ENV,
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

  let instrumentationLogPath = join(inputs.outDir, "instrumentation.log");
  let instrumentationOutput = "";
  // Mutable holder: the error arrives from a child-process event callback, so
  // control-flow narrowing on a plain `let` would pin it to `null` here.
  const instrumentationSpawnError: { current: Error | null } = { current: null };
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

    // Ownership gate: every destructive or host-touching step below runs only
    // against the explicitly named dedicated emulator/AVD that carries the
    // canonical app under test. Read-only identity first; a wrong or missing
    // target throws here, before `adb reverse` and before `pm clear`.
    const deviceIdentity = await readCapableHistoryDeviceIdentity({
      target: inputs,
      appId: inputs.appId,
    });
    Object.assign(deviceEvidence, deviceIdentity);
    assertCapableHistoryDeviceOwnership({
      identity: deviceIdentity,
      expectedAvd: inputs.expectedAvd,
      expectedAppId: inputs.canonicalAppId,
      runnerComponent: inputs.runnerComponent,
    });
    deviceEvidence.ownershipVerified = true;
    state.deviceVerified = true;

    // N1 preflight: the host may only bind a port verified free here, so the
    // environment/health probe can never answer from a foreign host already
    // listening on the chosen port.
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
      label: "capable-history-journey-runner",
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

    await runAdb(inputs, ["reverse", `tcp:${String(inputs.port)}`, `tcp:${String(inputs.port)}`]);
    state.reverseAdded = true;

    const clearResult = await runCommand(
      inputs.adbPath,
      adbArgs(inputs, ["shell", "pm", "clear", inputs.appId]),
    );
    const clearEvidence = {
      appId: inputs.appId,
      serial: inputs.serial,
      exitCode: clearResult.code,
      stdout: clearResult.stdout.trim(),
      stderr: clearResult.stderr.trim(),
      success: capableHistoryClearSucceeded(clearResult),
    };
    deviceEvidence.clear = clearEvidence;
    if (!clearEvidence.success) {
      throw capableHistoryJourneyError(
        "device-clear-failed",
        `pm clear ${inputs.appId} on ${inputs.serial} did not report success`,
      );
    }

    instrumentationLogPath = join(inputs.outDir, `instrumentation-${String(Date.now())}.log`);
    // The instrumented test's markers are written to the device log
    // (`System.out`); `am instrument -w` does not echo them. Clear the device
    // log first so no earlier run's markers can satisfy the gate, then read
    // the markers from the device log after the run.
    await runAdb(inputs, ["logcat", "-c"]);
    const devicePairingUrl = state.devicePairingUrl;
    if (!devicePairingUrl) {
      throw capableHistoryJourneyError(
        "pairing-url-missing",
        "the device pairing URL was never minted; refusing to instrument with an empty value",
      );
    }
    // Every value crossing `adb shell` is a complete POSIX literal word
    // (`adbShellLiteral`), pairing URL included: the remote shell must receive
    // the exact text, never a tokenized or glob-expanded variant of it.
    const instrumentation = spawn(
      inputs.adbPath,
      adbArgs(inputs, [
        "shell",
        "am",
        "instrument",
        "-w",
        "-r",
        "-e",
        "class",
        adbShellLiteral(inputs.instrumentationClass),
        "-e",
        "pairingUrl",
        adbShellLiteral(devicePairingUrl),
        "-e",
        "prefixMarker",
        adbShellLiteral(CAPABLE_HISTORY_PREFIX_MARKER),
        "-e",
        "userPrefixMarker",
        adbShellLiteral(CAPABLE_HISTORY_PREFIX_USER_MARKER),
        "-e",
        "assistantPrefixMarker",
        adbShellLiteral(CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER),
        "-e",
        "liveMarker",
        adbShellLiteral(capableHistoryLiveDoneMarker()),
        inputs.runnerComponent,
      ]),
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    state.instrumentation = instrumentation;
    // A spawn failure emits `error`; keep a persistent listener so it becomes
    // owned cleanup/join evidence instead of an unhandled event (N5).
    instrumentation.on("error", (error: Error) => {
      instrumentationSpawnError.current ??= error;
    });
    instrumentation.stdout?.on("data", (chunk: Buffer) => {
      instrumentationOutput += chunk.toString("utf8");
    });
    instrumentation.stderr?.on("data", (chunk: Buffer) => {
      instrumentationOutput += chunk.toString("utf8");
    });

    // Wait until the device's explicit acknowledgement is durable on the host:
    // the notice becomes readable through the same declared route the app uses.
    const ackDeadline = Date.now() + 300_000;
    let acknowledged = false;
    while (Date.now() < ackDeadline) {
      if (instrumentationSpawnError.current) {
        throw capableHistoryJourneyError(
          "instrumentation-spawn-failed",
          instrumentationSpawnError.current.message,
        );
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
      if (instrumentation.exitCode !== null) {
        throw capableHistoryJourneyError(
          "instrumentation-exited-before-ack",
          `exit=${String(instrumentation.exitCode)}`,
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
      commandId: `capable-history-start-${randomUUID()}`,
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

    const timeoutMs = options.instrumentationTimeoutMs ?? 600_000;
    const instrumentationExit = await Promise.race([
      waitForChildClose(instrumentation),
      new Promise<null>((resolveWait) => {
        setTimeout(() => resolveWait(null), timeoutMs).unref?.();
      }),
    ]);
    if (instrumentationSpawnError.current) {
      throw capableHistoryJourneyError(
        "instrumentation-spawn-failed",
        instrumentationSpawnError.current.message,
      );
    }
    if (instrumentationExit === null) {
      throw capableHistoryJourneyError("instrumentation-timeout", `${String(timeoutMs)}ms`);
    }
    // Marker transport: the `am instrument` stream plus the device log the
    // test's `System.out` markers land in. `redact` runs over both, so the
    // pairing token check below covers the device log too.
    const deviceLog = await runAdb(inputs, ["logcat", "-d", "-v", "threadtime", "-t", "8000"]);
    const markerOutput = `${instrumentationOutput}\n${deviceLog.stdout}`;
    const redacted = redact(markerOutput, secrets);
    writeFileSync(instrumentationLogPath, redacted, { mode: 0o600 });
    if (instrumentationExit !== 0 || !/OK \(\d+ test/.test(redacted)) {
      throw capableHistoryJourneyError(
        "instrumentation-failed",
        `exit=${String(instrumentationExit)} (${instrumentationLogPath})`,
      );
    }
    for (const marker of REQUIRED_CAPABLE_HISTORY_UI_MARKERS) {
      if (!redacted.includes(marker)) {
        throw capableHistoryJourneyError("instrumentation-marker-missing", marker);
      }
    }
    if (deviceToken !== null && redacted.includes(deviceToken)) {
      throw capableHistoryJourneyError("pairing-token-leaked-to-log", instrumentationLogPath);
    }
    provenance.instrumentation = {
      class: inputs.instrumentationClass,
      exit: instrumentationExit,
      logPath: instrumentationLogPath,
      logSha256: sha256File(instrumentationLogPath),
      requiredMarkers: [...REQUIRED_CAPABLE_HISTORY_UI_MARKERS],
    };
    provenance.finishedAt = new Date().toISOString();
  } catch (error) {
    throwable = error;
    if (instrumentationSpawnError.current) {
      provenance.instrumentationSpawnError = instrumentationSpawnError.current.message;
    }
    if (instrumentationOutput.length > 0) {
      writeFileSync(instrumentationLogPath, redact(instrumentationOutput, secrets), {
        mode: 0o600,
      });
      provenance.instrumentation = {
        logPath: instrumentationLogPath,
        logSha256: sha256File(instrumentationLogPath),
        failed: true,
      };
    }
  } finally {
    const cleanupEvidence: Record<string, unknown> = {};
    if (state.deviceVerified) {
      try {
        cleanupEvidence.screenshots = await pullCapableHistoryScreenshots({
          target: inputs,
          appId: inputs.appId,
          outDir: inputs.outDir,
        });
      } catch (error) {
        cleanupEvidence.screenshotError = error instanceof Error ? error.message : String(error);
      }
    } else {
      cleanupEvidence.screenshots = { skipped: "device ownership not verified" };
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
    if (state.instrumentation && state.instrumentation.exitCode === null) {
      state.instrumentation.kill("SIGKILL");
    }
    if (state.launch) {
      try {
        await stopHeadlessChild(state.launch.child);
        cleanupEvidence.hostStopped = true;
      } catch (error) {
        cleanupEvidence.hostStopError = error instanceof Error ? error.message : String(error);
      }
    }
    if (state.reverseAdded) {
      try {
        await runAdb(inputs, ["reverse", "--remove", `tcp:${String(inputs.port)}`]);
        cleanupEvidence.reverseRemoved = true;
      } catch (error) {
        cleanupEvidence.reverseRemoveError = error instanceof Error ? error.message : String(error);
      }
    } else {
      cleanupEvidence.reverseRemoved = false;
    }
    await cleanup.shutdown("capable-history-journey");
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
    instrumentationLogPath,
  };
}
