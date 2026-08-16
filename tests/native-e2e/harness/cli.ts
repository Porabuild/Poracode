import {
  CONTROL_CAPABILITY_ENV,
  LOOPBACK_HOST,
  SHUTDOWN_TIMEOUT_MS,
  STARTUP_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
} from "./constants.ts";
import { ControlServer, type ControlPlane } from "./controlServer.ts";
import { CoverageLedger } from "./coverageLedger.ts";
import { loadProtocolManifest } from "./manifest.ts";
import {
  computeManifestHash,
  inventoryBindingFormatVersion,
  inventorySourceHash,
} from "./operationMap.ts";
import { ProcessCleanup } from "./processCleanup.ts";
import { writeReadinessDescriptor } from "./readiness.ts";
import { missingServerArtifactBlocker, startRealHost, type RealHostHandle } from "./realHost.ts";
import {
  assertPortsFree,
  cleanupRunDirectory,
  createRunDirectory,
  parseSlot,
  portsForSlot,
  type RunDirectory,
  type SlotPorts,
} from "./runDirectory.ts";
import { startMockHarness } from "./startMockHarness.ts";
import type { HarnessMode, LabState } from "./types.ts";
import {
  SCENARIO_ACTION_PATH,
  SCENARIO_DESCRIPTOR_PATH,
  SCENARIO_STATE_PATH,
} from "./nativeScenario.ts";
import {
  NATIVE_E2E_KEEP_ENV,
  NATIVE_E2E_LEDGER_FORMAT_VERSION,
  NATIVE_E2E_READY_FORMAT_VERSION,
  NATIVE_E2E_RUN_DIR_VERSION,
  NATIVE_E2E_SCENARIO_FORMAT_VERSION,
  NATIVE_E2E_SCENARIO_API_VERSION,
  NATIVE_E2E_SLOT_ENV,
} from "./versions.ts";

export interface CliOptions {
  readonly mode: HarnessMode;
  readonly slot: SlotPorts;
  readonly basePath: string;
  readonly capability: string;
  readonly startupTimeoutMs: number;
  readonly testTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly keep: boolean;
}

export function parseCliOptions(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      index += 1;
    }
  }

  const positionalMode = argv.find((token) => token === "mock" || token === "real");
  const mode = (args.get("mode") ?? positionalMode ?? env.NATIVE_E2E_MODE ?? "mock") as HarnessMode;
  if (mode !== "mock" && mode !== "real") {
    throw new Error("mode must be mock or real");
  }
  if (
    args.has("host-port") ||
    args.has("control-port") ||
    env.NATIVE_E2E_HOST_PORT ||
    env.NATIVE_E2E_CONTROL_PORT
  ) {
    throw new Error("CLI ports come from PORACODE_NATIVE_E2E_SLOT; do not pass host/control ports");
  }

  const slot = portsForSlot(parseSlot(args.get("slot") ?? env[NATIVE_E2E_SLOT_ENV]));
  const basePath = args.get("base-path") ?? env.NATIVE_E2E_BASE_PATH ?? "";
  const capability = env[CONTROL_CAPABILITY_ENV]?.trim();
  if (!capability) {
    throw new Error(
      `${CONTROL_CAPABILITY_ENV} must be set by the supervisor; the CLI will not invent one`,
    );
  }

  return {
    mode,
    slot,
    basePath,
    capability,
    startupTimeoutMs: readTimeout(env.NATIVE_E2E_STARTUP_TIMEOUT_MS, STARTUP_TIMEOUT_MS),
    testTimeoutMs: readTimeout(env.NATIVE_E2E_TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
    shutdownTimeoutMs: readTimeout(env.NATIVE_E2E_SHUTDOWN_TIMEOUT_MS, SHUTDOWN_TIMEOUT_MS),
    keep: env[NATIVE_E2E_KEEP_ENV] === "1",
  };
}

export async function runHarnessCli(options: CliOptions): Promise<void> {
  const cleanup = new ProcessCleanup({ shutdownTimeoutMs: options.shutdownTimeoutMs });
  cleanup.attachSignals();
  const runDir = createRunDirectory({ keep: options.keep });
  cleanup.add(() => cleanupRunDirectory(runDir.path, { keep: options.keep }));

  const hostPort = options.mode === "real" ? options.slot.productionHost : options.slot.appHost;
  await assertPortsFree([
    hostPort,
    options.slot.control,
    options.slot.relay,
    options.slot.productionHost,
    options.slot.upstream,
  ]);

  const startupTimer = setTimeout(() => {
    process.stderr.write("native-e2e: startup timed out\n");
    void cleanup.shutdown("startup-timeout").finally(() => process.exit(1));
  }, options.startupTimeoutMs);
  const testTimer = setTimeout(() => {
    process.stderr.write("native-e2e: test timeout reached, shutting down\n");
    void cleanup.shutdown("test-timeout").finally(() => process.exit(1));
  }, options.testTimeoutMs);
  startupTimer.unref?.();
  testTimer.unref?.();

  if (options.mode === "mock") {
    const started = await startMockHarness({
      lab: {
        host: LOOPBACK_HOST,
        port: hostPort,
        allowEphemeralPort: false,
        secretsDir: runDir.secretsDir,
        journalPath: runDir.journalPath,
        ...(options.basePath ? { basePath: options.basePath } : {}),
      },
      control: { host: LOOPBACK_HOST, port: options.slot.control, capability: options.capability },
      capability: options.capability,
      cleanup,
    });
    writeReadiness(
      options,
      runDir,
      started.hostPort,
      started.controlPort,
      started.httpBaseUrl,
      started.wsBaseUrl,
    );
    clearTimeout(startupTimer);
    process.stderr.write(
      `native-e2e mock host ready runDir=${runDir.path} host=${started.httpBaseUrl} control=http://${LOOPBACK_HOST}:${String(started.controlPort)}\n`,
    );
    return;
  }

  const real = await startRealHost({
    host: LOOPBACK_HOST,
    port: hostPort,
    startupTimeoutMs: options.startupTimeoutMs,
    cleanup,
    secretsDir: runDir.secretsDir,
    baseDirRoot: runDir.path,
  });
  cleanup.add(() => real.stop());
  const plane = createRealControlPlane(real, options.slot.control);
  const control = new ControlServer(plane, {
    host: LOOPBACK_HOST,
    port: options.slot.control,
    capability: options.capability,
  });
  await control.start();
  cleanup.add(() => control.stop());
  writeReadiness(
    options,
    runDir,
    real.hostPort,
    control.port,
    real.httpBaseUrl,
    real.wsBaseUrl,
    real.pid,
  );
  clearTimeout(startupTimer);
  process.stderr.write(
    `native-e2e real host ready runDir=${runDir.path} host=${real.httpBaseUrl} control=http://${LOOPBACK_HOST}:${String(control.port)}\n`,
  );
}

function writeReadiness(
  options: CliOptions,
  runDir: RunDirectory,
  hostPort: number,
  controlPort: number,
  httpBaseUrl: string,
  wsBaseUrl: string,
  hostPid?: number,
): void {
  const manifest = loadProtocolManifest();
  writeReadinessDescriptor(runDir.readyPath, {
    schemaVersion: NATIVE_E2E_READY_FORMAT_VERSION,
    mode: options.mode,
    scenario: options.mode === "real" ? "real-host-smoke" : "mock-foundation",
    protocolVersion: manifest.protocolVersion,
    bindingFormatVersion: inventoryBindingFormatVersion(),
    manifestHash: computeManifestHash(manifest, inventorySourceHash()),
    ledgerFormatVersion: NATIVE_E2E_LEDGER_FORMAT_VERSION,
    scenarioFormatVersion: NATIVE_E2E_SCENARIO_FORMAT_VERSION,
    runDirVersion: NATIVE_E2E_RUN_DIR_VERSION,
    bindHost: "127.0.0.1",
    ports: {
      appHost: options.slot.appHost,
      control: controlPort,
      relay: options.slot.relay,
      productionHost: options.slot.productionHost,
      upstream: options.slot.upstream,
    },
    pids: {
      supervisor: process.pid,
      ...(hostPid !== undefined ? { host: hostPid } : {}),
    },
    httpBaseUrl,
    wsBaseUrl,
    environmentPath: `${options.basePath}/.well-known/poracode/environment`.replace(/\/{2,}/g, "/"),
    websocketPath: `${options.basePath}${manifest.wireFormat.webSocketPath}`.replace(
      /\/{2,}/g,
      "/",
    ),
    basePath: options.basePath,
    ...(options.mode === "mock"
      ? {
          scenarioApi: {
            formatVersion: NATIVE_E2E_SCENARIO_API_VERSION,
            descriptorPath: SCENARIO_DESCRIPTOR_PATH,
            statePath: SCENARIO_STATE_PATH,
            actionPath: SCENARIO_ACTION_PATH,
            authScheme: "harness-capability" as const,
            pairing: "action-result-only" as const,
          },
        }
      : {}),
  });
  void hostPort;
}

function createRealControlPlane(host: RealHostHandle, controlPort: number): ControlPlane {
  const ledger = new CoverageLedger();
  const unavailable = (code: HarnessBlockerCode, message: string) => ({ code, message });
  return {
    mode: "real",
    state: (): LabState => ({
      mode: "real",
      protocolVersion: loadProtocolManifest().protocolVersion,
      bindHost: "127.0.0.1",
      hostPort: host.hostPort,
      controlPort,
      seq: 0,
      replayCount: 0,
      pairingOutstanding: true,
      accessSessionCount: 0,
      ticketOutstandingCount: 0,
      connectionCount: 0,
      faults: [],
      blockers: host.blockers.map((blocker) => ({ code: blocker.code })),
      ledgerProfile: "core",
    }),
    activateFault: () =>
      unavailable(
        "real-host-no-fault-injection",
        "The production RemoteAccessServer has no deterministic fault-injection seam.",
      ),
    emitFrame: () =>
      unavailable(
        "real-host-no-emit",
        "The production host has no public control-plane emit seam.",
      ),
    applyCheckpoint: () =>
      unavailable("host-mode-unavailable", "Real host checkpoints are not injectable."),
    reset: () => undefined,
    restartReal: () => host.restart(),
    ledger: () => ledger,
  };
}

type HarnessBlockerCode =
  | "missing-server-artifact"
  | "pair-json-unavailable"
  | "posix-pairing-required"
  | "real-host-no-fault-injection"
  | "real-host-no-emit"
  | "project-seed-unavailable"
  | "slot-port-occupied"
  | "host-mode-unavailable";

function readTimeout(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid timeout: ${raw}`);
  return value;
}

export function describeMissingRealHost(): string {
  return missingServerArtifactBlocker().message;
}

const isCliEntry =
  process.argv[1]?.endsWith("cli.ts") === true || process.argv[1]?.endsWith("cli.js") === true;
if (isCliEntry) {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  runHarnessCli(options).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`native-e2e failed: ${detail}\n`);
    process.exit(1);
  });
}
