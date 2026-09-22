import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { arch, cpus, freemem, homedir, loadavg, platform, release, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "../../src/shared/contracts/agentInstance.ts";
import type { RendererPerfSnapshot } from "../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import {
  assertBaselineArmReady,
  computeArmRecord,
  readObserverAck,
  type ArmRecord,
} from "./helpers/armFreeze.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import { classifyServerFrame, FrameClassAccounting } from "./helpers/frameClassification.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import { ProcessCpuSampler } from "./helpers/processCpuSampler.ts";
import { ProcessMemorySampler } from "./helpers/processMemorySampler.ts";
import { buildMetricsArtifact } from "./helpers/profileMetrics.ts";
import {
  ManagedCdpClient,
  launchManagedAppSession,
  stopManagedAppSession,
  type ManagedAppSession,
} from "./helpers/managedAppSession.ts";
import { createManagedHostHandle } from "./helpers/managedHostHandle.ts";
import { acquireDeviceCredential, allocateLoopbackPort } from "./helpers/profileClientFactory.ts";
import {
  buildPaneSetupScript,
  buildProducerStreams,
  diagnoseProducerFailure,
  parseQualificationCellSpec,
  seedQualificationFixture,
  startProducerStreams,
  verifyProducerStreams,
  waitForFixtureThreadsInStore,
  waitForNaturalBoot,
  waitForVisiblePanes,
  type ProducerStartEvidence,
  type QualificationFixture,
} from "./helpers/qualificationCell.ts";
import {
  observerStatusEvidence,
  phaseWindowEvidence,
  type PhaseWindowEvidence,
} from "./helpers/rendererPhaseEvidence.ts";
import {
  buildStructuredWorkloadInstance,
  closeStructuredWorkloadThread,
  collectCanonicalGuiFrameEvidence,
  interruptStructuredWorkloadThread,
  launchStructuredWorkloadThread,
  prepareStructuredWorkloadMarkers,
  readSeededStructuredWorkloadInstance,
  readStructuredWorkloadMarker,
  resolveStructuredWorkloadParams,
  STRUCTURED_WORKLOAD_FIXTURE_PATH,
  structuredWorkloadFixtureSha256,
  structuredWorkloadHash,
  structuredWorkloadSettingsPath,
  waitForCanonicalGuiFrames,
  waitForStructuredWorkloadExit,
  waitForStructuredWorkloadPid,
  waitForStructuredWorkloadThreadStatus,
  waitForStructuredWorkloadWireStatus,
  writeStructuredWorkloadSettingsSeed,
  type CanonicalGuiFrameEvidence,
  type StructuredWorkloadLaunchEvidence,
  type StructuredWorkloadMarkers,
  type StructuredWorkloadParams,
  type StructuredWorkloadStatusEvidence,
  type StructuredWorkloadWireStatus,
} from "./helpers/structuredWorkload.ts";
import {
  runTrustedInputProtocol,
  type TrustedInputProtocolResult,
} from "./helpers/trustedInputProtocol.ts";
import {
  buildContaminationRecord,
  buildPartialRunManifest,
} from "./helpers/v2qPartialRunManifest.ts";
import {
  captureElementScreenshot,
  captureRectScreenshot,
  captureTerminalDomDiagnostics,
  classifyTerminalGenerationStability,
  deliverTerminalCommand,
  discoverTerminalShellId,
  ensureRenderedTerminalDomText,
  openIntegratedTerminalPanel,
  readStructuredRenderedText,
  readTerminalLiveStreamingProbe,
  readTerminalSurface,
  readVisiblePaneText,
  reopenIntegratedTerminalPanel,
  verifyTerminalShellGenerationStability,
  waitForAppShellPty,
  waitForTerminalRenderedText,
  type AppShellBindEvidence,
  type TerminalCommandDeliveryEvidence,
  type TerminalGenerationStabilityEvidence,
  type TerminalPanelOpenEvidence,
  type TerminalPanelReopenEvidence,
  type TerminalShellDiscovery,
  type TerminalTextWaitEvidence,
} from "./helpers/visibleTerminalPanel.ts";

/**
 * v2 architecture qualification cell (plan §4.2) on a frozen arm.
 *
 * One cell = one managed Electron session (staged and torn down by the
 * interactive-testing skill launcher) with:
 *  - two fixed visible chat panes plus one visible terminal pane,
 *  - 1/8/32/64 synthetic provider streams (real supervisor PTYs, declared
 *    stand-ins) travelling the production supervisor → host → WS pipeline,
 *  - 1/4/8 instrumented WS clients with per-frame class/byte accounting,
 *  - trusted CDP input and a controlled long task when the cell requests it,
 *  - renderer diagnostics snapshots (observer status, sample counts, raw
 *    input delay / processing / interaction-duration records),
 *  - node perf NDJSON (main/backend/supervisor roles, IPC queue counters),
 *  - arm, build, session-runtime and workload metadata in one run manifest.
 *
 * The cell refuses to launch without the coordinator's observer-ready
 * acknowledgment (arm hash match, no A1/A2 edits) — see `armFreeze.ts`.
 */

const cell = parseQualificationCellSpec(process.env);

const ARM_ROOT = process.env.V2Q_ARM_ROOT ?? "";
const OUT_DIR = process.env.V2Q_OUT_DIR ?? "";
const ACK_PATH = process.env.V2Q_OBSERVER_ACK ?? "";

const SNAPSHOT_REFRESH_INTERVAL_MS = 5_000;
const SETTLE_MS = 10_000;
/** Bounded deadline for the post-reload diagnostics handle. */
const DIAGNOSTICS_ACTIVATION_TIMEOUT_MS = 90_000;

interface NodePerfQueueSummary {
  readonly waitingEstimatedBytesMax: number;
  readonly oldestQueuedMessageAgeMsMax: number;
  readonly shedMessagesMax: number;
}

interface NodePerfRoleSummary {
  readonly role: string;
  readonly file: string;
  readonly samples: number;
  readonly eventLoopDelayP99MaxMs: number;
  readonly eventLoopDelayMaxMs: number;
  readonly cpuOneCorePercentMax: number;
  readonly rssBytesMax: number;
  readonly rssBytesLast: number;
  readonly queueMaxima: Readonly<Record<string, NodePerfQueueSummary>>;
}

function summarizeNodePerfDirectory(directory: string): NodePerfRoleSummary[] {
  if (!existsSync(directory)) return [];
  const summaries: NodePerfRoleSummary[] = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".ndjson"))) {
    const path = join(directory, file);
    let role = "unknown";
    let samples = 0;
    let p99Max = 0;
    let delayMax = 0;
    let cpuMax = 0;
    let rssMax = 0;
    let rssLast = 0;
    const queues: Record<string, NodePerfQueueSummary> = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (parsed.kind === "start" && typeof parsed.role === "string") role = parsed.role;
      if (parsed.kind !== "sample") continue;
      samples += 1;
      const delay = parsed.eventLoopDelay as
        | { p99Ms?: number | null; maxMs?: number | null }
        | undefined;
      if (typeof delay?.p99Ms === "number") p99Max = Math.max(p99Max, delay.p99Ms);
      if (typeof delay?.maxMs === "number") delayMax = Math.max(delayMax, delay.maxMs);
      const cpu = parsed.cpu as { oneCorePercent?: number } | undefined;
      if (typeof cpu?.oneCorePercent === "number") cpuMax = Math.max(cpuMax, cpu.oneCorePercent);
      const memory = parsed.memory as { rssBytes?: number } | undefined;
      if (typeof memory?.rssBytes === "number") {
        rssMax = Math.max(rssMax, memory.rssBytes);
        rssLast = memory.rssBytes;
      }
      const ipcQueues = parsed.ipcQueues as Record<string, Record<string, unknown>> | undefined;
      for (const [queueName, sample] of Object.entries(ipcQueues ?? {})) {
        const current = queues[queueName] ?? {
          waitingEstimatedBytesMax: 0,
          oldestQueuedMessageAgeMsMax: 0,
          shedMessagesMax: 0,
        };
        queues[queueName] = {
          waitingEstimatedBytesMax: Math.max(
            current.waitingEstimatedBytesMax,
            typeof sample.waitingEstimatedBytes === "number" ? sample.waitingEstimatedBytes : 0,
          ),
          oldestQueuedMessageAgeMsMax: Math.max(
            current.oldestQueuedMessageAgeMsMax,
            typeof sample.oldestQueuedMessageAgeMs === "number"
              ? sample.oldestQueuedMessageAgeMs
              : 0,
          ),
          shedMessagesMax: Math.max(
            current.shedMessagesMax,
            typeof sample.shedMessages === "number" ? sample.shedMessages : 0,
          ),
        };
      }
    }
    summaries.push({
      role,
      file,
      samples,
      eventLoopDelayP99MaxMs: p99Max,
      eventLoopDelayMaxMs: delayMax,
      cpuOneCorePercentMax: cpuMax,
      rssBytesMax: rssMax,
      rssBytesLast: rssLast,
      queueMaxima: queues,
    });
  }
  return summaries;
}

function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

function fileHash(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sanitizedSessionManifest(session: ManagedAppSession): Record<string, unknown> {
  const { token: _token, ...rest } = session.raw;
  return rest;
}

function hold(durationMs: number, onTick: () => Promise<void>): Promise<void> {
  return (async () => {
    const deadline = Date.now() + durationMs;
    let nextTick = Date.now();
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (Date.now() >= nextTick) {
        nextTick += SNAPSHOT_REFRESH_INTERVAL_MS;
        await onTick();
      }
    }
  })();
}

let armRecord: ArmRecord | undefined;
let session: ManagedAppSession | undefined;
let cdp: ManagedCdpClient | undefined;
let fixture: QualificationFixture | undefined;
let hostLoad: HostLoadSampler | undefined;
let memory: ProcessMemorySampler | undefined;
let cpu: ProcessCpuSampler | undefined;
let clients: ProfileClient[] = [];
// Clients closed on purpose mid-cell (the reconnect probe's original socket).
// They keep their metrics for the seq-gap gate but are never pinged again.
let retiredClients: ProfileClient[] = [];
const accounting = new Map<string, FrameClassAccounting>();
const timeline: Record<string, number | string> = {};
const protocolEvidence: {
  idle: PhaseWindowEvidence | undefined;
  blocked: PhaseWindowEvidence | undefined;
} = { idle: undefined, blocked: undefined };
let paneVerification: Record<string, unknown> | undefined;
let producerVerification: Record<string, unknown> | undefined;
let producerStartEvidence: ProducerStartEvidence[] = [];
let producerDiagnosis: string | null = null;
let trustedInput: TrustedInputProtocolResult | undefined;
let fixtureStore: Awaited<ReturnType<typeof waitForFixtureThreadsInStore>> | undefined;
let preflightObserver: Record<string, unknown> | undefined;
let managedHandle: Awaited<ReturnType<typeof createManagedHostHandle>> | undefined;
let accessToken: string | undefined;
let legacyLabel: string | null = null;
let slowClientEvidence: Record<string, unknown> | undefined;
let reconnectClientEvidence: Record<string, unknown> | undefined;
let structuredMarkers: StructuredWorkloadMarkers | undefined;
let structuredParams: StructuredWorkloadParams | undefined;
let structuredInstance: AgentInstanceConfig | undefined;
let structuredSeedEvidence: Record<string, unknown> | undefined;
let structuredLaunch: StructuredWorkloadLaunchEvidence | undefined;
let structuredReadyStatus: StructuredWorkloadStatusEvidence | undefined;
let structuredWireStatus: StructuredWorkloadWireStatus | undefined;
let structuredFrameEvidence: CanonicalGuiFrameEvidence | null = null;
let structuredFrameError: string | null = null;
let structuredStopEvidence: Record<string, unknown> | undefined;
let structuredChildPid: number | undefined;
let structuredCleanupAttempted = false;
let structuredRenderedBefore: Awaited<ReturnType<typeof readStructuredRenderedText>> | null = null;
let structuredRenderedAfter: Awaited<ReturnType<typeof readStructuredRenderedText>> | null = null;
let terminalPanelOpen: TerminalPanelOpenEvidence | undefined;
let terminalForeground:
  | Awaited<ReturnType<ManagedCdpClient["prepareForegroundSurface"]>>
  | undefined;
let terminalShellDiscovery: TerminalShellDiscovery | undefined;
let terminalShellBindInitial: AppShellBindEvidence | undefined;
let terminalShellBind: AppShellBindEvidence | undefined;
let terminalShellRebind: AppShellBindEvidence | undefined;
let terminalPanelReopen: TerminalPanelReopenEvidence | undefined;
let terminalShellRediscovery: TerminalShellDiscovery | undefined;
let terminalShellProbeAfter: AppShellBindEvidence | undefined;
let terminalFirstDelivery: TerminalCommandDeliveryEvidence | undefined;
let terminalSecondDelivery: TerminalCommandDeliveryEvidence | undefined;
let terminalWaitFirst: TerminalTextWaitEvidence | undefined;
let terminalWaitSecond: TerminalTextWaitEvidence | undefined;
let terminalRemountFirst: TerminalPanelReopenEvidence | undefined;
let terminalRemountSecond: TerminalPanelReopenEvidence | undefined;
let terminalDomAfterRemountFirst: Awaited<ReturnType<typeof ensureRenderedTerminalDomText>> | null =
  null;
let terminalDomAfterRemountSecond: Awaited<
  ReturnType<typeof ensureRenderedTerminalDomText>
> | null = null;
let terminalLiveStreamingProbe:
  | Awaited<ReturnType<typeof readTerminalLiveStreamingProbe>>
  | undefined;
let terminalProbeClient: ProfileClient | undefined;
let terminalProbeAccounting: FrameClassAccounting | undefined;
let terminalProbeFrameLog: Record<string, unknown>[] | undefined;
let terminalStartPath:
  | {
      readonly appOwnedDeferredStart: boolean;
      readonly harnessFallbackAttempted: false;
      readonly note: string;
    }
  | undefined;
let terminalGenerationStabilityFirst: TerminalGenerationStabilityEvidence | undefined;
let terminalGenerationStabilitySecond: TerminalGenerationStabilityEvidence | undefined;
let terminalProductionDefect: Record<string, unknown> | null = null;
let terminalSecondRenderedRecorded: boolean | null = null;
let terminalDomText: Awaited<ReturnType<typeof ensureRenderedTerminalDomText>> | undefined;
let terminalSurfaceEvidence: Awaited<ReturnType<typeof readTerminalSurface>> | undefined;
let terminalCommands: { readonly first: string; readonly second: string } | undefined;
let paneTextEvidence: Awaited<ReturnType<typeof readVisiblePaneText>> | undefined;
let paneScreenshots: Awaited<ReturnType<typeof captureElementScreenshot>>[] = [];
// Set once the body writes the final run.json; afterAll writes a partial
// manifest only when this is still false (a late abort must not lose the
// sampler/contamination summaries).
let runManifestWritten = false;
// First error message(s) recorded from the failed cell body (see afterEach).
let cellBodyFailure: string | null = null;

function mark(name: string): void {
  timeline[name] = Date.now();
}

function requireCell() {
  if (!cell) throw new Error("qualification cell spec is absent");
  return cell;
}

describe.skipIf(!cell)(`v2 architecture qualification cell (${cell?.id ?? "none"})`, () => {
  beforeAll(async () => {
    const spec = requireCell();
    for (const [name, value] of [
      ["V2Q_ARM_ROOT", ARM_ROOT],
      ["V2Q_OUT_DIR", OUT_DIR],
      ["V2Q_OBSERVER_ACK", ACK_PATH],
    ] as const) {
      if (!value) throw new Error(`${name} is required`);
    }
    const ack = readObserverAck(ACK_PATH);
    armRecord = computeArmRecord(ARM_ROOT, ack);
    assertBaselineArmReady(armRecord, ack);
    mkdirSync(OUT_DIR, { recursive: true });
    const perfDir = join(OUT_DIR, "perf");
    const evidenceDir = join(OUT_DIR, "evidence");
    mkdirSync(perfDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });
    writeJson(join(evidenceDir, "arm-record.json"), armRecord);
    writeJson(join(evidenceDir, "observer-ack.json"), {
      acknowledgedBy: ack.acknowledgedBy,
      acknowledgedAt: ack.acknowledgedAt,
      observerSha256: ack.observerSha256,
    });

    const remotePort = await allocateLoopbackPort();
    const sessionRoot = join(
      homedir(),
      ".poracode-smoke",
      "v2q",
      `${basename(ARM_ROOT)}-${spec.id}`,
    );
    rmSync(sessionRoot, { recursive: true, force: true });

    const structured = spec.structuredWorkload;
    if (structured) {
      // The fixture is a real ACP child launched by the supervisor. Mock mode
      // sets PORACODE_MOCK_AGENTS=1 and refuses every structured child; the
      // guard is never weakened — the cell refuses to run instead.
      if (process.env.PORACODE_MOCK_AGENTS) {
        throw new Error(
          "structured workload cells require a non-mock agent environment; " +
            "the launch guard is never weakened to run the fixture",
        );
      }
      if (spec.clients < 1) {
        throw new Error(
          "structured workload cells need at least one instrumented WS client to count canonical GUI frames",
        );
      }
      structuredMarkers = prepareStructuredWorkloadMarkers(sessionRoot);
      const steadyMs = Math.max(60_000, spec.durationMs + 180_000);
      structuredParams = resolveStructuredWorkloadParams({
        durationMs: steadyMs,
        textChunks: Math.max(64, Math.ceil((steadyMs / 1000) * 25) + 8),
        selfDestructMs: steadyMs + 300_000,
        promptMarkerPath: structuredMarkers.promptMarkerPath,
        cancelMarkerPath: structuredMarkers.cancelMarkerPath,
        readyMarkerPath: structuredMarkers.readyMarkerPath,
        exitMarkerPath: structuredMarkers.exitMarkerPath,
        ...structured.params,
      });
      structuredInstance = buildStructuredWorkloadInstance(structuredParams, structured.instanceId);
      // Offline seed BEFORE host start: the managed settings merge preserves
      // on-disk `acp-generic` instances and filters renderer-originated ones.
      const seedPath = structuredWorkloadSettingsPath(sessionRoot);
      writeStructuredWorkloadSettingsSeed({
        settingsPath: seedPath,
        instance: structuredInstance,
      });
      mark("structuredSeedWritten");
    }

    mark("launchStart");
    session = await launchManagedAppSession({
      armRoot: ARM_ROOT,
      sessionRoot,
      mode: structured ? "real" : "mock",
      env: {
        PORACODE_PERF_OUTPUT_DIR: perfDir,
        PORACODE_PERF_INTERVAL_MS: "1000",
        PORACODE_REMOTE_ACCESS_PORT: String(remotePort),
        // A PTY producer runs on a headless supervisor PTY with no terminal
        // emulator answering capability queries. The reference machine's login
        // shell is fish, whose startup waits up to 10 s for a Primary Device
        // Attributes response and swallowed harness input during that wait; a
        // POSIX `sh -l` login shell starts without terminal probing. Declared
        // harness environment, recorded in the run manifest.
        ...(spec.producers > 0 ? { SHELL: "/bin/sh" } : {}),
        // A structured cell must not inherit a mock-agent flag from the
        // invoking shell: the launcher's real mode never sets it, and the
        // fixture must be launched by the production guard, not around it.
        ...(structured ? { PORACODE_MOCK_AGENTS: undefined } : {}),
      },
      // The arm's session-owned runtime is built on first launch.
      launcherTimeoutSeconds: 900,
    });
    mark("sessionReady");
    if (structured && session.mode !== "real") {
      throw new Error(
        `structured workload cell launched in ${session.mode} mode; the fixture requires the isolated real-mode profile`,
      );
    }
    writeJson(join(evidenceDir, "session-manifest.json"), sanitizedSessionManifest(session));
    const runtimeManifestPath = join(session.root, "runtime-manifest.json");
    if (existsSync(runtimeManifestPath)) {
      writeJson(
        join(evidenceDir, "runtime-manifest.json"),
        JSON.parse(readFileSync(runtimeManifestPath, "utf8")),
      );
    }
    writeJson(join(evidenceDir, "session-artifacts.json"), {
      sessionManifestSha256: fileHash(session.sessionFile),
      runtimeManifestSha256: fileHash(runtimeManifestPath),
    });

    if (structured && structuredInstance && structuredParams && structuredMarkers) {
      const settingsPath = join(session.baseDir, "settings.json");
      const expectedSeedPath = structuredWorkloadSettingsPath(sessionRoot);
      const onDisk = readSeededStructuredWorkloadInstance({
        settingsPath,
        instanceId: structured.instanceId,
      });
      structuredSeedEvidence = {
        expectedSeedPath,
        settingsPath,
        seedPathMatchesProfile: settingsPath === expectedSeedPath,
        settingsSha256: fileHash(settingsPath),
        instanceId: structured.instanceId,
        instance: onDisk,
        params: structuredParams,
        paramsHash: structuredWorkloadHash(structuredParams),
        fixturePath: STRUCTURED_WORKLOAD_FIXTURE_PATH,
        fixtureSha256: structuredWorkloadFixtureSha256(),
        markerPaths: structuredMarkers,
      };
      writeJson(join(evidenceDir, "structured-seed.json"), structuredSeedEvidence);
      if (settingsPath !== expectedSeedPath) {
        throw new Error(
          `structured workload seed path ${expectedSeedPath} does not match the launched profile ${settingsPath}`,
        );
      }
      mark("structuredSeedVerified");
    }

    cdp = await ManagedCdpClient.connect({ cdpPort: session.cdpPort, appUrl: session.appUrl });
    await cdp.waitForRendererReady();
    if (!(await cdp.hasDevBridge())) {
      throw new Error(
        "managed renderer has no DEV bridge; pane setup requires the skill-managed development session",
      );
    }
    mark("cdpReady");

    try {
      fixture = await seedQualificationFixture({
        cdp,
        spec,
        expectedProjectDir: session.projectDir,
        ...(structured
          ? {
              structuredWorkload: {
                threadId: structured.threadId,
                instanceId: structured.instanceId,
              },
            }
          : {}),
      });
      writeJson(join(evidenceDir, "fixture.json"), fixture);
      mark("fixtureSeeded");

      const preflightSnapshot = await cdp.enablePerfDiagnosticsAndReload({
        timeoutMs: DIAGNOSTICS_ACTIVATION_TIMEOUT_MS,
        evidenceDir,
        label: "diagnostics-activation",
      });
      const preflight = preflightSnapshot as unknown as RendererPerfSnapshot;
      preflightObserver = observerStatusEvidence(preflight) as unknown as Record<string, unknown>;
      writeJson(join(evidenceDir, "observer-preflight.json"), preflightObserver);
      writeJson(join(evidenceDir, "observer-preflight-snapshot.json"), preflightSnapshot);
      mark("diagnosticsActive");

      // Product gate: the reloaded renderer must complete its own hydration and
      // leave the startup spinner/recovery screen BEFORE any fixture install.
      const naturalBoot = await waitForNaturalBoot({ cdp, timeoutMs: 90_000 });
      writeJson(join(evidenceDir, "natural-boot.json"), naturalBoot);
      mark("naturalBoot");

      fixtureStore = await waitForFixtureThreadsInStore({
        cdp,
        fixture,
        timeoutMs: 30_000,
      });
      writeJson(join(evidenceDir, "fixture-store.json"), fixtureStore);
      mark("fixtureHydrated");
    } catch (error) {
      await cdp.captureDiagnosticEvidence(evidenceDir, "setup-failure", {
        error: error instanceof Error ? error.message : String(error),
        timeline,
      });
      throw error;
    }

    try {
      // Only a pane-hosted terminal thread is part of the pane layout. The
      // integrated Terminal panel terminal is opened later through its real UI
      // path; its shell is owned and started by the app itself.
      const paneHostedTerminal = spec.terminalSurface === "pane";
      const expectedPaneCount = fixture.paneThreadIds.length + (paneHostedTerminal ? 1 : 0);
      const paneSetup = (await cdp.evaluate(
        buildPaneSetupScript({
          chatThreadIds: fixture.paneThreadIds,
          terminalThreadId: paneHostedTerminal ? fixture.terminalThreadId : null,
        }),
      )) as { ok?: boolean; step?: string; panes?: string[]; viewKind?: string };
      if (paneSetup.ok !== true) {
        throw new Error(`visible pane setup failed: ${JSON.stringify(paneSetup)}`);
      }
      const panes = await waitForVisiblePanes({
        cdp,
        spec,
        expectedPaneCount,
        timeoutMs: 60_000,
      });
      paneVerification = panes as unknown as Record<string, unknown>;
      writeJson(join(evidenceDir, "visible-panes.json"), panes);
      if (panes.viewKind !== "thread" || panes.paneThreadsPresent.some((present) => !present)) {
        throw new Error(`visible panes are not bound to seeded threads: ${JSON.stringify(panes)}`);
      }
      const missingPanes = fixture.paneThreadIds.filter((id) => !panes.panes.includes(id));
      if (missingPanes.length > 0) {
        throw new Error(
          `declared visible panes are missing from the layout: ${missingPanes.join(", ")}`,
        );
      }
      if (panes.panes.length !== expectedPaneCount) {
        throw new Error(
          `visible pane count ${String(panes.panes.length)} != declared ${String(
            expectedPaneCount,
          )} (the structured producer is a declared visible pane, not an extra)`,
        );
      }
      if (spec.visibleChatPanes > 0 && panes.composerCount < 1) {
        throw new Error("no chat composer rendered in the visible panes");
      }
      if (paneHostedTerminal && panes.xtermCount < 1) {
        throw new Error("no terminal surface rendered in the visible panes");
      }
    } catch (error) {
      await cdp.captureDiagnosticEvidence(evidenceDir, "pane-setup-failure", {
        error: error instanceof Error ? error.message : String(error),
        timeline,
      });
      throw error;
    }
    mark("panesVerified");

    // PTY producers use their own supervisor shell ids. A pane thread id must
    // never be reused as a producer shell id: the app manages visible terminal
    // threads itself, and a harness `startShell` on that id replaces (or is
    // replaced by) the app-owned PTY. The diagnosis is recorded in
    // `producers.json`; the PTY itself is always a real supervisor shell.
    const streams = buildProducerStreams(spec.producers);
    producerStartEvidence = await startProducerStreams({
      cdp,
      projectLocation: fixture.projectLocation,
      streams,
    });
    const producers = await verifyProducerStreams({ cdp, streams });
    producerVerification = producers as unknown as Record<string, unknown>;
    producerDiagnosis =
      producers.verified < spec.producers
        ? diagnoseProducerFailure({
            start: producerStartEvidence,
            verification: producers,
            expected: spec.producers,
          })
        : null;
    writeJson(join(evidenceDir, "producers.json"), {
      start: producerStartEvidence,
      verification: producers,
      diagnosis: producerDiagnosis,
    });
    if (producers.verified < spec.producers) {
      throw new Error(producerDiagnosis ?? "synthetic streams are not running");
    }
    mark("producersStarted");

    const hostHandle = await createManagedHostHandle({ cdp, session });
    managedHandle = hostHandle;
    const credential = await acquireDeviceCredential(hostHandle, "v2q-profile");
    accessToken = credential.accessToken;
    for (let index = 0; index < spec.clients; index += 1) {
      const label = `v2q-c${String(index + 1).padStart(2, "0")}`;
      const clientAccounting = new FrameClassAccounting();
      accounting.set(label, clientAccounting);
      const isLegacy = spec.legacyClient && index === spec.clients - 1;
      if (isLegacy) legacyLabel = label;
      const client = await ProfileClient.create({
        handle: hostHandle,
        label,
        accessToken: credential.accessToken,
        onMessage: (frame) =>
          clientAccounting.record(frame.bytes, classifyServerFrame(frame.message)),
      });
      clients.push(client);
      const interests = isLegacy
        ? []
        : [
            ...fixture.chatThreadIds,
            fixture.terminalThreadId,
            ...(fixture.structuredThreadId === null ? [] : [fixture.structuredThreadId]),
          ];
      // Accounting entitlement includes every terminal id this client
      // explicitly watches (the producer shells), so requested terminal frames
      // are not misreported as offscreen bulk.
      clientAccounting.setInterests([...interests, ...streams.map((stream) => stream.shellId)]);
      if (!isLegacy) {
        client.sendJson({
          type: "thread-item-interests",
          threadIds: [
            ...fixture.chatThreadIds,
            ...(fixture.structuredThreadId === null ? [] : [fixture.structuredThreadId]),
          ],
        });
      }
      if (!isLegacy) {
        // Watch every terminal id the cell measures: the visible terminal
        // fixture (when present) and each real PTY producer shell.
        const terminalIds = [
          ...(spec.visibleTerminal ? [fixture.terminalThreadId] : []),
          ...streams.map((stream) => stream.shellId),
        ];
        for (const terminalId of terminalIds) {
          await client.watchTerminalReliable(terminalId, `${label}-watch-${terminalId}`);
        }
      }
    }
    writeJson(
      join(evidenceDir, "client-roster.json"),
      clients.map((client) => ({ label: client.label, readySeq: client.metrics.readySeq })),
    );
    mark("clientsReady");

    if (structured && structuredMarkers && structuredInstance) {
      try {
        structuredLaunch = await launchStructuredWorkloadThread({
          cdp,
          projectLocation: fixture.projectLocation,
          spec: structured,
        });
        mark("structuredLaunchIssued");
        // The authoritative provider status is the host's `thread-state` wire
        // event delivered to the interested WS client, not the interest-
        // filtered renderer store. The renderer row is recorded alongside it
        // and the producer is also an open visible pane, so rendering is real.
        const wire = await waitForStructuredWorkloadWireStatus({
          sources: clients,
          threadId: structured.threadId,
          label: "working",
          accept: (status) => status.status === "working" || status.status === "error",
          timeoutMs: 120_000,
        });
        structuredWireStatus = wire.accepted;
        if (wire.accepted.status === "error") {
          throw new Error(
            `structured workload thread errored on launch: ${String(wire.accepted.errorMessage)}`,
          );
        }
        structuredReadyStatus = await waitForStructuredWorkloadThreadStatus({
          cdp,
          threadId: structured.threadId,
          label: "working",
          accept: (status) => status.status === "working" || status.status === "error",
          timeoutMs: 120_000,
        });
        structuredChildPid = await waitForStructuredWorkloadPid({
          markerPath: structuredMarkers.readyMarkerPath,
        });
        writeJson(join(evidenceDir, "structured-launch.json"), {
          ...structuredLaunch,
          wireStatus: structuredWireStatus,
          rendererStatus: structuredReadyStatus,
          childPid: structuredChildPid,
          promptMarker: readStructuredWorkloadMarker(structuredMarkers.promptMarkerPath),
        });
        mark("structuredWorking");
        // First canonical frames prove the fixture's real ACP session reached
        // the WS pipeline before the measurement window opens.
        structuredFrameEvidence = await waitForCanonicalGuiFrames({
          sources: clients,
          threadId: structured.threadId,
          minTotal: 1,
          label: "fixture startup",
          timeoutMs: 120_000,
        });
        mark("structuredFirstFrames");
      } catch (error) {
        await cdp.captureDiagnosticEvidence(evidenceDir, "structured-launch-failure", {
          error: error instanceof Error ? error.message : String(error),
          timeline,
        });
        throw error;
      }
    }

    hostLoad = new HostLoadSampler();
    hostLoad.start(2_000);
    memory = new ProcessMemorySampler(session.appPid ?? session.ownerPid);
    memory.start(1_000);
    cpu = new ProcessCpuSampler(session.appPid ?? session.ownerPid);
    cpu.start(1_000);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    mark("settled");
  }, 900_000);

  // The single cell body records its failure here so afterAll can write the
  // partial manifest with the exact abort reason; vitest populates the task
  // result (assertion errors included) before afterEach hooks run.
  afterEach((context) => {
    const result = context.task.result;
    cellBodyFailure =
      result?.state === "fail"
        ? (result.errors ?? []).map((error) => error.message).join("; ") ||
          "cell body failed without an error message"
        : null;
  });

  afterAll(async () => {
    const perfDir = join(OUT_DIR, "perf");
    const evidenceDir = join(OUT_DIR, "evidence");
    let teardownError: Error | undefined;
    try {
      for (const client of clients) await client.close();
      clients = [];
      retiredClients = [];
    } catch {
      // Teardown continues; the session stop below is the owning cleanup.
    }
    try {
      mkdirSync(evidenceDir, { recursive: true });
      const entries = cdp?.consoleLog() ?? [];
      writeJson(join(evidenceDir, "renderer-console.json"), {
        entries,
        consoleErrorCount: entries.filter(
          (entry) => entry.level === "error" || entry.kind === "exception",
        ).length,
      });
    } catch {
      // Best-effort evidence; teardown below must still run.
    }
    try {
      // If the test body failed before its Stop/join leg, still drive the
      // production Stop + disposal path and record the child-join result; the
      // session stop below remains the owning cleanup.
      const structuredSpec = cell?.structuredWorkload;
      if (structuredSpec && cdp && fixture && !structuredCleanupAttempted) {
        structuredCleanupAttempted = true;
        const cleanup: Record<string, unknown> = { attempted: true };
        try {
          await interruptStructuredWorkloadThread({ cdp, threadId: structuredSpec.threadId });
        } catch (error) {
          cleanup.interruptError = error instanceof Error ? error.message : String(error);
        }
        try {
          await closeStructuredWorkloadThread({ cdp, threadId: structuredSpec.threadId });
        } catch (error) {
          cleanup.closeError = error instanceof Error ? error.message : String(error);
        }
        if (structuredChildPid !== undefined) {
          try {
            cleanup.childExit = await waitForStructuredWorkloadExit({
              pid: structuredChildPid,
              timeoutMs: 15_000,
            });
          } catch (error) {
            cleanup.childExitError = error instanceof Error ? error.message : String(error);
          }
        }
        mkdirSync(evidenceDir, { recursive: true });
        writeJson(join(evidenceDir, "structured-cleanup.json"), cleanup);
      }
    } catch {
      // Best-effort cleanup; the session stop below owns process teardown.
    }
    try {
      if (session && ARM_ROOT) {
        mark("stopStart");
        await stopManagedAppSession({ armRoot: ARM_ROOT, sessionFile: session.sessionFile });
        mark("stopped");
        const finalState = existsSync(session.sessionFile)
          ? (JSON.parse(readFileSync(session.sessionFile, "utf8")) as { state?: unknown }).state
          : "missing";
        writeJson(join(evidenceDir, "teardown.json"), {
          stopAcknowledged: true,
          finalSessionState: finalState,
          sessionManifestSha256: fileHash(session.sessionFile),
        });
        if (finalState !== "stopped") {
          throw new Error(
            `owned session did not stop after verified teardown: ${String(finalState)}`,
          );
        }
      }
    } catch (error) {
      teardownError = error instanceof Error ? error : new Error(String(error));
    } finally {
      cdp?.close();
      await hostLoad?.stop();
      await memory?.stop();
      await cpu?.stop();
    }
    try {
      mkdirSync(evidenceDir, { recursive: true });
      writeJson(join(evidenceDir, "node-perf-summary.json"), summarizeNodePerfDirectory(perfDir));
      writeJson(join(evidenceDir, "timeline.json"), timeline);
      writeJson(
        join(evidenceDir, "client-accounting.json"),
        Object.fromEntries(
          [...accounting.entries()].map(([label, value]) => [label, value.snapshot()]),
        ),
      );
    } catch {
      // Evidence write failures surface in the run summary below.
    }
    if (!runManifestWritten) {
      // The cell body aborted before its final run.json write (a late abort).
      // Record a partial manifest with the summaries that exist plus the
      // failure message. Diagnostics only: no budget verdicts (they were never
      // computed), no pass/fail semantics, budgets untouched — the final
      // run.json remains the only qualified manifest.
      try {
        const contaminationSummary = hostLoad ? await hostLoad.summary() : null;
        writeJson(
          join(OUT_DIR, "run-partial.json"),
          buildPartialRunManifest({
            spec: requireCell(),
            arm: armRecord ?? null,
            failure: cellBodyFailure,
            timeline,
            clientAccounting: Object.fromEntries(
              [...accounting.entries()].map(([label, value]) => [label, value.snapshot()]),
            ),
            contamination: buildContaminationRecord(contaminationSummary),
            memory: memory?.summary() ?? null,
            processCpu: cpu?.summary() ?? null,
            nodePerf: summarizeNodePerfDirectory(join(OUT_DIR, "perf")),
          }),
        );
      } catch {
        // Best-effort partial manifest; never mask the original failure.
      }
    }
    if (teardownError) throw teardownError;
  }, 180_000);

  it(
    "runs the cell protocol and writes one workload manifest",
    async () => {
      const spec = requireCell();
      if (!cdp || !session || !fixture || !armRecord) throw new Error("cell setup incomplete");
      const evidenceDir = join(OUT_DIR, "evidence");
      const windowStartedAtMs = Date.now();
      const clientsBefore = clients.map((client) => ({
        label: client.label,
        eventsReceived: client.metrics.eventsReceived,
        appBytesReceived: client.metrics.appBytesReceived,
      }));

      const beforeSteady = (await cdp.snapshot()) as unknown as RendererPerfSnapshot | null;
      mark("steadyStart");

      const legacyIndex = spec.legacyClient ? spec.clients - 1 : -1;
      const slowIndex = spec.slowClient
        ? legacyIndex === spec.clients - 1
          ? spec.clients - 2
          : spec.clients - 1
        : -1;
      const reconnectIndex = spec.reconnectClient
        ? spec.clients - 1 - (legacyIndex >= 0 ? 1 : 0) - (slowIndex >= 0 ? 1 : 0)
        : -1;
      let slowSeqAtPause: number | null = null;
      let slowResume: Promise<void> = Promise.resolve();
      if (slowIndex >= 0) {
        const slowClient = clients[slowIndex];
        if (slowClient) {
          slowClient.pauseSocket();
          slowSeqAtPause = slowClient.metrics.lastEventSeq;
          const pausedMs = Math.min(20_000, spec.durationMs);
          slowResume = new Promise<void>((resolve) => {
            setTimeout(() => {
              const frozen = slowClient.metrics.lastEventSeq === slowSeqAtPause;
              slowClientEvidence = {
                label: slowClient.label,
                seqAtPause: slowSeqAtPause,
                frozenWhilePaused: frozen,
                pausedMs,
                seqAfterResume: slowClient.metrics.lastEventSeq,
              };
              slowClient.resumeSocket();
              resolve();
            }, pausedMs);
          });
        }
      }

      // ── Rendered-evidence baselines before the measured window ───────────
      // Structured text must be proven from the rendered pane DOM (the
      // fixture's chunk markers only exist after the GUI thread rendered the
      // ACP content deltas), not from wire/e store counters.
      const structuredMarkerPrefix = structuredParams?.marker ?? "slw";
      structuredRenderedBefore = spec.structuredWorkload
        ? await readStructuredRenderedText(cdp, structuredMarkerPrefix).catch(() => null)
        : null;

      // Visible terminal: the app's integrated Terminal panel owns a dedicated
      // shell (`shell:<uuid>`) started by the app itself. The harness opens the
      // panel through its real UI control, discovers that app-owned id, proves
      // the PTY generation/cursor, and types a command through trusted keyboard
      // input into the mounted xterm.
      if (spec.terminalSurface === "panel") {
        mark("terminalPanelOpenStart");
        terminalForeground = await cdp.prepareForegroundSurface();
        terminalPanelOpen = await openIntegratedTerminalPanel({ cdp });
        if (!terminalPanelOpen.surfaceVisible) {
          writeJson(join(evidenceDir, "terminal-panel-open.json"), terminalPanelOpen);
          throw new Error(
            `integrated Terminal panel did not become visible ` +
              `(path=${terminalPanelOpen.path}, attempts=${JSON.stringify(terminalPanelOpen.attempts)}, ` +
              `errors=${terminalPanelOpen.errors.join("; ") || "none"})`,
          );
        }
        writeJson(join(evidenceDir, "terminal-panel-open.json"), terminalPanelOpen);
        // Re-run the panel surface's own fit/resize path once the dock is
        // visible (a UI-level resize event; no store state is forced).
        await cdp.evaluate(`(window.dispatchEvent(new Event("resize")), "ok")`).catch(() => null);
        terminalShellDiscovery = await discoverTerminalShellId(cdp);
        const panelShellId = terminalShellDiscovery.terminalIds[0] ?? null;
        if (panelShellId === null || !panelShellId.startsWith("shell:")) {
          throw new Error(
            `no app-owned panel shell id discovered from the mounted terminal ` +
              `(source=${terminalShellDiscovery.source}, ids=${terminalShellDiscovery.terminalIds.join(", ") || "none"})`,
          );
        }
        terminalShellBindInitial = await waitForAppShellPty({
          cdp,
          shellId: panelShellId,
          timeoutMs: 12_000,
        });
        terminalShellBind = terminalShellBindInitial;
        if (!terminalShellBind.bound) {
          // No raw `startShell` fallback: a raw start bypasses the renderer's
          // shellStartRegistry, so the panel's deferred start stays armed and
          // any later fit re-issues `startShell` for this id, replacing the
          // very PTY generation under test (proven in
          // tmp/v2-production/a0-terminal-investigation.md). Only the app's own
          // deferred start is valid; the bounded layout nudges already applied
          // by waitForAppShellPty are recorded. This is a harness blocker, not
          // a reason to manufacture a PTY.
          writeJson(join(evidenceDir, "terminal-panel-bind-failure.json"), {
            open: terminalPanelOpen,
            foreground: terminalForeground,
            discovery: terminalShellDiscovery,
            bind: terminalShellBind,
            startPath: "app-deferred-start-only (no raw startShell fallback issued)",
            surface: await readTerminalSurface(cdp).catch(() => null),
            diagnostics: await captureTerminalDomDiagnostics(cdp).catch(() => null),
            consoleTail: cdp.consoleLog().slice(-12),
          });
          throw new Error(
            `app-owned panel shell ${panelShellId} did not start through the app's own deferred path: ` +
              `${terminalShellBind.lastError ?? "no error"} (probe=${JSON.stringify(terminalShellBind.probe)}, ` +
              `nudges=${JSON.stringify(terminalShellBind.nudges)}); no raw startShell fallback is issued`,
          );
        }
        terminalStartPath = {
          appOwnedDeferredStart: true,
          harnessFallbackAttempted: false,
          note:
            "panel shell bound through the app's own startDeferredPanelShell path; " +
            "no raw startShell fallback or declared host restart was issued",
        };
        const terminalToken = Date.now().toString(36);
        terminalCommands = {
          first: `v2qpanel${terminalToken}-one`,
          second: `v2qpanel${terminalToken}-two`,
        };
        // The panel's first mount installs its terminal watch before the shell
        // exists (the watch is refused for an unknown id and never streams).
        // Closing and reopening reuses the same app-owned tab/shell and
        // establishes the watch against the live shell. Real UI workflow.
        terminalPanelReopen = await reopenIntegratedTerminalPanel({ cdp });
        const rediscovery = await discoverTerminalShellId(cdp);
        terminalShellRediscovery = rediscovery;
        if (rediscovery.terminalIds[0] !== panelShellId) {
          throw new Error(
            `terminal shell id changed across the panel reopen: ${panelShellId} -> ` +
              `${rediscovery.terminalIds[0] ?? "none"}`,
          );
        }
        terminalShellRebind = await waitForAppShellPty({
          cdp,
          shellId: panelShellId,
          timeoutMs: 8_000,
        });
        if (!terminalShellRebind.bound) {
          throw new Error(
            `app-owned panel shell ${panelShellId} lost its PTY across the panel reopen: ` +
              `${terminalShellRebind.lastError ?? "no error"}`,
          );
        }
        terminalShellBind = terminalShellRebind;
        // The reopen must re-attach to the same app-owned generation: the
        // renderer's shellStartRegistry marks the id, so the deferred start
        // does not fire again. A changed generation here is the same
        // harness-generation-mismatch signature the raw stand-in caused.
        const reopenGeneration = classifyTerminalGenerationStability({
          expectedGeneration: terminalShellBindInitial.probe?.generation ?? null,
          observedGeneration: terminalShellRebind.probe?.generation ?? null,
        });
        terminalGenerationStabilityFirst = reopenGeneration;
        if (reopenGeneration.replacementDetected) {
          writeJson(join(evidenceDir, "terminal-generation-mismatch-reopen.json"), {
            classification: reopenGeneration.classification,
            stability: reopenGeneration,
            bindInitial: terminalShellBindInitial,
            bindAfterReopen: terminalShellRebind,
            reopen: terminalPanelReopen,
            startPath: terminalStartPath ?? null,
          });
          throw new Error(
            `harness-generation-mismatch: app-owned panel shell ${panelShellId} was replaced across the ` +
              `panel reopen (${reopenGeneration.detail}); the surface verdict is invalid`,
          );
        }
        // No declared host restart: the generation that the app started is the
        // generation under test for the whole run. Re-issuing `startShell` for
        // an app-owned id destroys its transcript and invalidates every later
        // read (see a0-terminal-investigation.md).
        // Independent harness watch on the same app-owned shell: this proves
        // whether the host streams terminal frames for the id, independent of
        // the renderer surface's own watch.
        if (managedHandle && accessToken) {
          const probeAccounting = new FrameClassAccounting();
          terminalProbeAccounting = probeAccounting;
          accounting.set("v2q-termprobe", probeAccounting);
          probeAccounting.setInterests([panelShellId]);
          const probeFrameLog: Record<string, unknown>[] = [];
          terminalProbeFrameLog = probeFrameLog;
          terminalProbeClient = await ProfileClient.create({
            handle: managedHandle,
            label: "v2q-termprobe",
            accessToken,
            onMessage: (frame) => {
              const classified = classifyServerFrame(frame.message);
              probeAccounting.record(frame.bytes, classified);
              if (classified.frameClass === "terminal" && probeFrameLog.length < 60) {
                probeFrameLog.push({
                  type: (frame.message as { type?: unknown }).type ?? null,
                  bytes: frame.bytes,
                  threadIds: classified.threadIds,
                  atMs: Date.now(),
                });
              }
            },
          });
          await terminalProbeClient.watchTerminalReliable(panelShellId, "v2q-termprobe-watch");
          clients.push(terminalProbeClient);
        }
        // The typed text assigns the token to a variable and expands it, so the
        // *echoed command line* does not contain the resolved output marker —
        // finding it in the DOM proves real shell output, not local echo.
        await new Promise((resolve) => setTimeout(resolve, 400));
        terminalFirstDelivery = await deliverTerminalCommand({
          cdp,
          shellId: panelShellId,
          command: `F=v2qpanel${terminalToken}; echo $F-one`,
        });
        terminalWaitFirst = await waitForTerminalRenderedText({
          cdp,
          marker: terminalCommands.first,
          timeoutMs: 12_000,
        });
        // Explicit harness invalidation check: a same-id `startShell` after the
        // command was written destroys the tested PTY generation (and its
        // transcript). That is classified as a harness-generation-mismatch, not
        // as a renderer paint/hydration defect — the marker bytes no longer
        // exist in the supervisor, so no surface behavior could show them.
        const firstGenerationCheck = await verifyTerminalShellGenerationStability({
          cdp,
          shellId: panelShellId,
          expectedGeneration: terminalShellBind?.probe?.generation ?? null,
          label: "after first command + wait",
          evidencePath: join(evidenceDir, "terminal-generation-mismatch-first.json"),
          extra: {
            commands: terminalCommands,
            delivery: terminalFirstDelivery,
            wait: terminalWaitFirst,
          },
        });
        terminalGenerationStabilityFirst = firstGenerationCheck.stability;
        if (firstGenerationCheck.stability.replacementDetected) {
          throw new Error(
            `harness-generation-mismatch: app-owned panel shell ${panelShellId} was replaced after the ` +
              `first command (${firstGenerationCheck.stability.detail}); the surface verdict is invalid`,
          );
        }
        terminalLiveStreamingProbe = await readTerminalLiveStreamingProbe({
          cdp,
          shellId: panelShellId,
          marker: terminalCommands.first,
          ...(terminalProbeAccounting === undefined
            ? {}
            : {
                clientTerminalFrames: terminalProbeAccounting.snapshot().framesByClass.terminal,
              }),
        });
        // Fallback proof path when the surface's live feed did not paint the
        // output: remount the panel (the app keeps the tab/shell) so the
        // surface hydrates the retained PTY scrollback into the DOM. The
        // remount must re-attach to the same app-owned generation; a
        // replacement here is still a harness mismatch and fails the run.
        if (!terminalWaitFirst.found) {
          terminalRemountFirst = await reopenIntegratedTerminalPanel({ cdp });
          await new Promise((resolve) => setTimeout(resolve, 900));
          terminalDomAfterRemountFirst = await ensureRenderedTerminalDomText({ cdp });
          await new Promise((resolve) => setTimeout(resolve, 300));
          terminalDomAfterRemountFirst = await ensureRenderedTerminalDomText({ cdp });
        } else {
          terminalDomAfterRemountFirst = terminalWaitFirst.domText;
        }
        const postRemountGenerationCheck = await verifyTerminalShellGenerationStability({
          cdp,
          shellId: panelShellId,
          expectedGeneration: terminalShellBind?.probe?.generation ?? null,
          label: "after first remount/hydration path",
          evidencePath: join(evidenceDir, "terminal-generation-mismatch-first-remount.json"),
          extra: {
            remount: terminalRemountFirst ?? null,
            domAfterRemount: terminalDomAfterRemountFirst,
          },
        });
        terminalGenerationStabilityFirst = postRemountGenerationCheck.stability;
        if (postRemountGenerationCheck.stability.replacementDetected) {
          throw new Error(
            `harness-generation-mismatch: app-owned panel shell ${panelShellId} was replaced across the ` +
              `first remount (${postRemountGenerationCheck.stability.detail}); the surface verdict is invalid`,
          );
        }
        const firstRendered =
          terminalDomAfterRemountFirst !== null &&
          terminalDomAfterRemountFirst.text.includes(terminalCommands.first);
        writeJson(join(evidenceDir, "terminal-panel-first.json"), {
          open: terminalPanelOpen,
          foreground: terminalForeground,
          discovery: terminalShellDiscovery,
          startPath: terminalStartPath ?? null,
          bindInitial: terminalShellBindInitial,
          reopen: terminalPanelReopen,
          rediscovery: terminalShellRediscovery,
          bindAfterReopen: terminalShellRebind,
          commands: terminalCommands,
          delivery: terminalFirstDelivery,
          generationStability: terminalGenerationStabilityFirst ?? null,
          probeFrameLog: terminalProbeFrameLog ?? null,
          liveStreamingProbe: terminalLiveStreamingProbe,
          wait: terminalWaitFirst,
          remount: terminalRemountFirst ?? null,
          domAfterRemount: terminalDomAfterRemountFirst,
          firstRendered,
        });
        if (!terminalFirstDelivery.echoObserved) {
          throw new Error(
            `typed command never reached the app-owned panel PTY ` +
              `(method=${terminalFirstDelivery.method}, typingError=${String(terminalFirstDelivery.typingError)})`,
          );
        }
        if (!firstRendered) {
          // The rendered-text gate cannot be satisfied in this managed session:
          // the app-owned PTY received and echoed the command (cursor advanced),
          // an independent host watch received the shell's terminal-output
          // frames, and the supervisor retained the bytes — but the mounted
          // surface never painted them and a remount replayed only the stale
          // hydration prefix. Record the exact defect signature (per the A0
          // instruction to report a required production fix rather than waive
          // the terminal requirement) and keep the remaining calibration legs
          // running.
          terminalProductionDefect = {
            marker: terminalCommands.first,
            deliveryMethod: terminalFirstDelivery?.method ?? null,
            deliveryEchoObserved: terminalFirstDelivery?.echoObserved ?? false,
            supervisorCursorAfter: terminalShellProbeAfter?.probe?.toCursor ?? null,
            probeClientTerminalFrames: terminalLiveStreamingProbe?.clientTerminalFrames ?? null,
            retainedScrollbackBytes: terminalLiveStreamingProbe?.retainedScrollbackBytes ?? null,
            surfaceRowsTextLength: terminalLiveStreamingProbe?.surfaceRowsTextLength ?? null,
            surfaceRenderer: terminalLiveStreamingProbe?.surfaceRenderer ?? null,
            domAfterRemountLength: terminalDomAfterRemountFirst?.length ?? null,
            liveWaitedMs: terminalWaitFirst.waitedMs,
          };
          writeJson(join(evidenceDir, "terminal-panel-first-failure.json"), {
            open: terminalPanelOpen,
            discovery: terminalShellDiscovery,
            startPath: terminalStartPath ?? null,
            bind: terminalShellBind,
            commands: terminalCommands,
            delivery: terminalFirstDelivery,
            generationStability: terminalGenerationStabilityFirst ?? null,
            probeFrameLog: terminalProbeFrameLog ?? null,
            wait: terminalWaitFirst,
            reopen: terminalPanelReopen,
            rediscovery: terminalShellRediscovery,
            bindAfterReopen: terminalShellRebind,
            liveStreamingProbe: terminalLiveStreamingProbe,
            remount: terminalRemountFirst ?? null,
            domAfterRemount: terminalDomAfterRemountFirst,
            surface: await readTerminalSurface(cdp).catch(() => null),
            diagnostics: await captureTerminalDomDiagnostics(cdp).catch(() => null),
            consoleTail: cdp.consoleLog().slice(-12),
          });
        }
        mark("terminalPanelFirstTyped");
      }

      const controlLatencies: number[] = [];
      let refreshIndex = 0;
      await hold(spec.durationMs, async () => {
        const client = clients[0];
        if (!client) return;
        const started = performance.now();
        await client.fetchJson("snapshot-refresh", "/api/snapshot?threadLimit=100");
        controlLatencies.push(performance.now() - started);
        await client.ping();
        refreshIndex += 1;
      });
      await slowResume;

      // ── Rendered-evidence advance legs (while the providers are live) ────
      if (spec.terminalSurface === "panel" && terminalCommands) {
        terminalSecondDelivery = await deliverTerminalCommand({
          cdp,
          shellId: terminalShellBind?.shellId ?? "",
          command: "echo $F-two",
        });
        terminalWaitSecond = await waitForTerminalRenderedText({
          cdp,
          marker: terminalCommands.second,
          timeoutMs: 12_000,
        });
        if (!terminalWaitSecond.found) {
          terminalRemountSecond = await reopenIntegratedTerminalPanel({ cdp });
          await new Promise((resolve) => setTimeout(resolve, 900));
          terminalDomAfterRemountSecond = await ensureRenderedTerminalDomText({ cdp });
          await new Promise((resolve) => setTimeout(resolve, 300));
          terminalDomAfterRemountSecond = await ensureRenderedTerminalDomText({ cdp });
        } else {
          terminalDomAfterRemountSecond = terminalWaitSecond.domText;
        }
        terminalSecondRenderedRecorded =
          terminalDomAfterRemountSecond !== null &&
          terminalDomAfterRemountSecond.text.includes(terminalCommands.second);
        terminalShellProbeAfter = await waitForAppShellPty({
          cdp,
          shellId: terminalShellBind?.shellId ?? "",
          timeoutMs: 5_000,
        });
        const secondGenerationCheck = await verifyTerminalShellGenerationStability({
          cdp,
          shellId: terminalShellBind?.shellId ?? "",
          expectedGeneration: terminalShellBind?.probe?.generation ?? null,
          label: "after second command + wait",
          evidencePath: join(evidenceDir, "terminal-generation-mismatch-second.json"),
          extra: {
            commands: terminalCommands,
            secondDelivery: terminalSecondDelivery,
            waitSecond: terminalWaitSecond,
            probeAfter: terminalShellProbeAfter,
          },
        });
        terminalGenerationStabilitySecond = secondGenerationCheck.stability;
        terminalDomText = await ensureRenderedTerminalDomText({ cdp });
        terminalSurfaceEvidence = await readTerminalSurface(cdp);
        const bindBefore = terminalShellBind?.probe ?? null;
        const probeAfter = terminalShellProbeAfter.probe;
        const ptyContinuity = {
          generationBefore: bindBefore?.generation ?? null,
          generationAfter: probeAfter?.generation ?? null,
          generationStable: secondGenerationCheck.stability.stable,
          cursorBefore: bindBefore?.toCursor ?? null,
          cursorAfter: probeAfter?.toCursor ?? null,
          cursorAdvanced: (probeAfter?.toCursor ?? 0) > (bindBefore?.toCursor ?? 0),
          deliveryGenerationStability: terminalSecondDelivery?.generationStability ?? null,
        };
        if (!ptyContinuity.generationStable) {
          writeJson(join(evidenceDir, "terminal-panel-advance-failure.json"), {
            classification: "harness-generation-mismatch",
            commands: terminalCommands,
            firstDelivery: terminalFirstDelivery ?? null,
            secondDelivery: terminalSecondDelivery,
            waitSecond: terminalWaitSecond,
            remountSecond: terminalRemountSecond ?? null,
            domAfterRemountSecond: terminalDomAfterRemountSecond,
            liveStreamingProbe: terminalLiveStreamingProbe ?? null,
            bindBefore: terminalShellBind ?? null,
            probeAfter: terminalShellProbeAfter,
            ptyContinuity,
            generationStability: secondGenerationCheck.stability,
            domText: terminalDomText,
            surface: terminalSurfaceEvidence,
            diagnostics: await captureTerminalDomDiagnostics(cdp).catch(() => null),
            consoleTail: cdp.consoleLog().slice(-12),
          });
          throw new Error(
            `harness-generation-mismatch: app-owned panel shell PTY was replaced across the measured ` +
              `window (${secondGenerationCheck.stability.detail}); the surface verdict is invalid`,
          );
        }
        if (!ptyContinuity.cursorAdvanced) {
          writeJson(join(evidenceDir, "terminal-panel-advance-failure.json"), {
            classification: "pty-did-not-advance",
            commands: terminalCommands,
            firstDelivery: terminalFirstDelivery ?? null,
            secondDelivery: terminalSecondDelivery,
            waitSecond: terminalWaitSecond,
            remountSecond: terminalRemountSecond ?? null,
            domAfterRemountSecond: terminalDomAfterRemountSecond,
            liveStreamingProbe: terminalLiveStreamingProbe ?? null,
            bindBefore: terminalShellBind ?? null,
            probeAfter: terminalShellProbeAfter,
            ptyContinuity,
            generationStability: secondGenerationCheck.stability,
            domText: terminalDomText,
            surface: terminalSurfaceEvidence,
            diagnostics: await captureTerminalDomDiagnostics(cdp).catch(() => null),
            consoleTail: cdp.consoleLog().slice(-12),
          });
          throw new Error(
            `app-owned panel shell PTY did not advance across the measured window: ` +
              `${JSON.stringify(ptyContinuity)}`,
          );
        }
        writeJson(join(evidenceDir, "terminal-panel-advance.json"), {
          commands: terminalCommands,
          startPath: terminalStartPath ?? null,
          firstDelivery: terminalFirstDelivery ?? null,
          secondDelivery: terminalSecondDelivery,
          waitFirst: terminalWaitFirst ?? null,
          waitSecond: terminalWaitSecond,
          remountFirst: terminalRemountFirst ?? null,
          remountSecond: terminalRemountSecond ?? null,
          domAfterRemountFirst: terminalDomAfterRemountFirst,
          domAfterRemountSecond: terminalDomAfterRemountSecond,
          liveStreamingProbe: terminalLiveStreamingProbe ?? null,
          liveStreamingObserved:
            terminalWaitFirst?.found === true && terminalWaitSecond?.found === true,
          renderedAdvance:
            (terminalDomAfterRemountFirst?.text.includes(terminalCommands.first) ?? false) &&
            (terminalDomAfterRemountSecond?.text.includes(terminalCommands.second) ?? false),
          secondRendered: terminalSecondRenderedRecorded,
          productionDefect: terminalProductionDefect,
          generationStability: {
            first: terminalGenerationStabilityFirst ?? null,
            second: terminalGenerationStabilitySecond ?? null,
          },
          // The rendered-text verdict is the functional terminal gate. The
          // ordinary trusted-keyboard/first-open journey is reported separately:
          // a `production-write-fallback` delivery evidences the PTY/render
          // path, not the keyboard journey.
          keyboardJourney: {
            first: terminalFirstDelivery?.deliveryJourney ?? null,
            second: terminalSecondDelivery?.deliveryJourney ?? null,
            firstOpenPassed: terminalFirstDelivery?.keyboardJourneyPassed === true,
            passed:
              terminalFirstDelivery?.keyboardJourneyPassed === true &&
              terminalSecondDelivery?.keyboardJourneyPassed === true,
          },
          verdict:
            terminalProductionDefect === null ? "rendered-pass" : "production-defect-reported",
          bindBefore: terminalShellBind ?? null,
          probeAfter: terminalShellProbeAfter,
          ptyContinuity,
          domText: terminalDomText,
          surface: terminalSurfaceEvidence,
        });
        mark("terminalPanelSecondTyped");
      }

      structuredRenderedAfter = spec.structuredWorkload
        ? await readStructuredRenderedText(cdp, structuredMarkerPrefix).catch(() => null)
        : null;
      const structuredTextAdvanced =
        structuredRenderedBefore !== null &&
        structuredRenderedAfter !== null &&
        structuredRenderedAfter.matchCount > structuredRenderedBefore.matchCount &&
        (structuredRenderedAfter.maxTextIndex ?? -1) >
          (structuredRenderedBefore.maxTextIndex ?? -1);
      if (spec.structuredWorkload) {
        writeJson(join(evidenceDir, "structured-rendered.json"), {
          before: structuredRenderedBefore,
          after: structuredRenderedAfter,
          advanced: structuredTextAdvanced,
        });
      }

      // Live captures of all three reference panes: the two chat panes (one of
      // which renders the structured producer) and the visible terminal.
      paneTextEvidence = await readVisiblePaneText(cdp);
      paneScreenshots = [];
      const screenshotTargets: {
        readonly label: string;
        readonly rect: { x: number; y: number; width: number; height: number } | null;
      }[] = [];
      for (const pane of paneTextEvidence) {
        screenshotTargets.push({ label: `pane-${String(pane.index)}`, rect: pane.rect });
      }
      if (structuredRenderedAfter?.containingPaneRect) {
        screenshotTargets.push({
          label: "structured",
          rect: structuredRenderedAfter.containingPaneRect,
        });
      }
      if (terminalSurfaceEvidence?.rect ?? terminalPanelOpen?.surfaceRect) {
        screenshotTargets.push({
          label: "terminal",
          rect: terminalSurfaceEvidence?.rect ?? terminalPanelOpen?.surfaceRect ?? null,
        });
      }
      for (const target of screenshotTargets) {
        if (!target.rect) continue;
        paneScreenshots.push(
          await captureRectScreenshot({
            cdp,
            selector: target.label,
            rect: target.rect,
            path: join(evidenceDir, `live-${target.label}.jpg`),
          }),
        );
      }
      const fullScreenshot = (await cdp
        .send("Page.captureScreenshot", { format: "jpeg", quality: 70 }, 15_000)
        .catch(() => null)) as { data?: unknown } | null;
      if (typeof fullScreenshot?.data === "string") {
        writeFileSync(
          join(evidenceDir, "live-all-surfaces.jpg"),
          Buffer.from(fullScreenshot.data, "base64"),
          { mode: 0o600 },
        );
      }
      writeJson(join(evidenceDir, "rendered-surfaces.json"), {
        structuredMarkerPrefix,
        structuredRenderedBefore,
        structuredRenderedAfter,
        structuredTextAdvanced,
        paneTextEvidence,
        paneScreenshots,
        terminalSurface: terminalSurfaceEvidence ?? null,
      });
      mark("renderedEvidenceCaptured");

      if (reconnectIndex >= 0 && managedHandle && accessToken) {
        const client = clients[reconnectIndex];
        if (client) {
          const lastSeenSeq = client.metrics.lastEventSeq ?? client.metrics.readySeq ?? 0;
          await client.close();
          const recoveredAccounting = new FrameClassAccounting();
          const recoveredLabel = `${client.label}-reconnect`;
          accounting.set(recoveredLabel, recoveredAccounting);
          const recovered = await ProfileClient.create({
            handle: managedHandle,
            label: recoveredLabel,
            accessToken,
            lastSeenSeq,
            onMessage: (frame) =>
              recoveredAccounting.record(frame.bytes, classifyServerFrame(frame.message)),
          });
          recoveredAccounting.setInterests([
            ...fixture.chatThreadIds,
            ...(fixture.structuredThreadId === null ? [] : [fixture.structuredThreadId]),
            fixture.terminalThreadId,
            ...buildProducerStreams(spec.producers).map((stream) => stream.shellId),
          ]);
          await recovered.watchTerminalReliable(
            fixture.terminalThreadId,
            `${recoveredLabel}-watch-visible-terminal`,
          );
          // The recovered connection takes the original's slot; the closed
          // original can no longer answer pings, so it is retired instead.
          clients.splice(reconnectIndex, 1, recovered);
          retiredClients.push(client);
          reconnectClientEvidence = {
            label: client.label,
            lastSeenSeq,
            readySeq: recovered.metrics.readySeq,
            replayedEventCount: recovered.metrics.replayedEventCount,
            eventSeqGaps: recovered.metrics.eventSeqGaps,
          };
        }
      }

      const inputProtocol = spec.protocol === "input" || spec.protocol === "longtask";
      expect(
        !inputProtocol || preflightObserver?.eventTimingStatus === "supported",
        "trusted-input cells require a supported Event Timing observer",
      ).toBe(true);

      if (inputProtocol) {
        trustedInput = await runTrustedInputProtocol({
          cdp,
          options: spec.trustedInput ?? {},
          evidenceDir,
        });
        protocolEvidence.idle = trustedInput.idle.window ?? undefined;
        protocolEvidence.blocked = trustedInput.blocked.window ?? undefined;
        // Segmented idle evidence: every batch's disjoint window, the raw
        // Event Timing records read inside it, and the union aggregate. The
        // union window is the only measured population; a lossy ring is
        // recorded as such and never converted into a percentile.
        writeJson(join(evidenceDir, "segmented-idle.json"), {
          segments: trustedInput.idle.segments,
          aggregate: trustedInput.idle.aggregate,
          window: trustedInput.idle.window,
          ringWindow: trustedInput.idle.ringWindow,
          batches: trustedInput.idle.segments.map((segment) => ({
            index: segment.index,
            kind: segment.kind,
            dispatchedClicks: segment.dispatchedClicks,
            dispatchedTypedChars: segment.dispatchedTypedChars,
            windowStartExclusive: segment.beforeCapturedAtMonotonicMs,
            windowEndInclusive: segment.afterCapturedAtMonotonicMs,
            contiguousWithPrevious: segment.contiguousWithPrevious,
            sampleCount: segment.samples.length,
            lateArrivalCount: segment.lateArrivalSamples.length,
            droppedEventTimings: segment.droppedEventTimings,
            skippedDelta: segment.skippedDelta,
            eligibleTrustedInputs: segment.eligibleTrustedInputs,
            pageSideMaxDelayMs: segment.pageSideMaxDelayMs,
            // Real-composer read-back for this type batch: declared chunk vs
            // actual editable text, so a type batch's declared character count
            // is never taken on faith.
            typingFidelity: segment.typingFidelity,
            barrier: {
              advanced: segment.barrier.advanced,
              waitedMs: segment.barrier.waitedMs,
              quietMs: segment.barrier.quietMs,
              timedOut: segment.barrier.timedOut,
              polls: segment.barrier.polls,
            },
          })),
        });
        writeJson(join(evidenceDir, "trusted-input-protocol.json"), {
          options: trustedInput.options,
          foreground: trustedInput.foreground,
          idle: {
            dispatch: trustedInput.idle.dispatch,
            barrier: trustedInput.idle.barrier,
            phaseEvents: trustedInput.idle.phaseEvents,
            rafFramesDuringPhase: trustedInput.idle.rafFramesDuringPhase,
            paintFramesPerSecond: trustedInput.idle.paintFramesPerSecond,
            durationMs: trustedInput.idle.durationMs,
            recorderBlock: trustedInput.idle.recorderAfter?.block ?? null,
            aggregate: trustedInput.idle.aggregate,
          },
          blocked: {
            cycles: trustedInput.blocked.cycles,
            dispatch: trustedInput.blocked.dispatch,
            barrier: trustedInput.blocked.barrier,
            phaseEvents: trustedInput.blocked.phaseEvents,
            rafFramesDuringPhase: trustedInput.blocked.rafFramesDuringPhase,
            paintFramesPerSecond: trustedInput.blocked.paintFramesPerSecond,
            durationMs: trustedInput.blocked.durationMs,
            recorderBlock: trustedInput.blocked.recorderAfter?.block ?? null,
          },
          idlePolicy: trustedInput.idlePolicy,
          blockedPolicy: trustedInput.blockedPolicy,
          policy: trustedInput.policy,
        });
        writeJson(join(evidenceDir, "protocol-input.json"), protocolEvidence);
        writeJson(join(evidenceDir, "protocol-snapshots.json"), {
          idleBefore: trustedInput.idle.before,
          idleAfter: trustedInput.idle.after,
          blockedBefore: trustedInput.blocked.before,
          blockedAfter: trustedInput.blocked.after,
          ringLoss: {
            eventTimings:
              (trustedInput.blocked.after?.droppedEventTimings ?? 0) -
              (trustedInput.idle.before?.droppedEventTimings ?? 0),
            longTasks:
              (trustedInput.blocked.after?.droppedLongTasks ?? 0) -
              (trustedInput.idle.before?.droppedLongTasks ?? 0),
            slowFrames:
              (trustedInput.blocked.after?.droppedSlowFrames ?? 0) -
              (trustedInput.idle.before?.droppedSlowFrames ?? 0),
            spans:
              (trustedInput.blocked.after?.droppedSpans ?? 0) -
              (trustedInput.idle.before?.droppedSpans ?? 0),
          },
          censoring: {
            requestedThresholdMs:
              trustedInput.blocked.after?.observers.eventTiming.requestedDurationThresholdMs ??
              null,
            effectiveThresholdMs:
              trustedInput.blocked.after?.observers.eventTiming.durationThresholdMs ?? null,
          },
        });
      }

      const idlePolicy = trustedInput?.idlePolicy;
      const blockedPolicy = trustedInput?.blockedPolicy;
      const trustedInputReasons =
        idlePolicy?.reasons.join("; ") ?? "trusted-input protocol did not run";
      // Idle population: measured, or an explicitly censored percentile that
      // is never treated as zero and never satisfies a numeric budget.
      expect(
        !inputProtocol || idlePolicy?.status === "measured" || idlePolicy?.status === "censored",
        `idle event-timing population ${idlePolicy?.status ?? "missing"}: ${trustedInputReasons}`,
      ).toBe(true);
      expect(
        !inputProtocol || idlePolicy?.status !== "censored" || idlePolicy.eligibleTrustedInputs > 0,
        "a censored idle population still requires eligible trusted input evidence",
      ).toBe(true);
      expect(
        !inputProtocol ||
          idlePolicy?.status !== "censored" ||
          (idlePolicy.droppedDuringWindow === 0 && idlePolicy.skippedDelta === 0),
        "a censored idle population requires no ring/skip entry loss",
      ).toBe(true);
      // Positive control: real scheduled DOM block + queued trusted input.
      expect(
        !inputProtocol || blockedPolicy?.ok === true,
        `blocked positive control failed: ${blockedPolicy?.reasons.join("; ") ?? "not run"}`,
      ).toBe(true);
      expect(
        spec.protocol !== "longtask" || (blockedPolicy?.longTask.over200Ms ?? 0) >= 1,
        "long-task cells must record at least one >=200ms blocking DOM task in the blocked phase",
      ).toBe(true);
      expect(
        !inputProtocol ||
          (blockedPolicy?.queued.delayMs !== null &&
            blockedPolicy?.queued.delayMs !== undefined &&
            blockedPolicy.queued.delayMs >= (trustedInput?.options.minQueuedInputDelayMs ?? 150)),
        "the queued trusted input must show the blocked-phase delay",
      ).toBe(true);
      const interactionSamples =
        idlePolicy?.status === "measured"
          ? (trustedInput?.idle.window?.eventTimings.interactions.count ?? 0)
          : blockedPolicy?.queued.eventTiming !== null &&
              blockedPolicy?.queued.eventTiming !== undefined
            ? 1
            : 0;
      expect(
        !inputProtocol || interactionSamples > 0,
        "trusted-input cells must report at least one interaction-level duration sample",
      ).toBe(true);
      // Typing fidelity: every declared typed character must be accounted for
      // exactly once in the real composer's editable text. The helper asserts
      // each batch's insertion in the app; this gate makes the aggregate
      // declaration honest in the run manifest (a lossy/unreadable composer can
      // never report a verified workload). Per-batch before/after text is in
      // evidence/segmented-idle.json.
      const typingFidelity = trustedInput?.idle.aggregate;
      expect(
        !inputProtocol ||
          typingFidelity === undefined ||
          typingFidelity.declaredTypedCharsTotal === 0 ||
          typingFidelity.typingFidelityVerified === true,
      ).toBe(true);

      const afterSteady = (await cdp.snapshot()) as RendererPerfSnapshot | null;
      mark("steadyEnd");
      const steadyEvidence =
        beforeSteady && afterSteady
          ? phaseWindowEvidence(beforeSteady, afterSteady, beforeSteady.phase)
          : null;
      if (steadyEvidence) writeJson(join(evidenceDir, "steady-window.json"), steadyEvidence);

      const finalProducerCheck = await verifyProducerStreams({
        cdp,
        streams: buildProducerStreams(spec.producers),
      });
      for (const client of clients) await client.ping();

      // Structured producer gate: canonical GUI frames attributed to the
      // fixture thread must be nonzero. PTY terminal frames and inactive
      // catalog rows never satisfy it; the failure stays a failure and keeps
      // its last observed counts as evidence.
      const structuredWorkloadSpec = spec.structuredWorkload;
      if (structuredWorkloadSpec && structuredMarkers && structuredChildPid !== undefined) {
        try {
          structuredFrameEvidence = await waitForCanonicalGuiFrames({
            sources: clients,
            threadId: structuredWorkloadSpec.threadId,
            minTotal: structuredWorkloadSpec.minCanonicalFrames,
            label: "steady window",
            timeoutMs: 60_000,
          });
        } catch (error) {
          structuredFrameError = error instanceof Error ? error.message : String(error);
          structuredFrameEvidence = collectCanonicalGuiFrameEvidence(
            clients,
            structuredWorkloadSpec.threadId,
          );
        }
        writeJson(join(evidenceDir, "structured-frames.json"), {
          evidence: structuredFrameEvidence,
          error: structuredFrameError,
          minCanonicalFrames: structuredWorkloadSpec.minCanonicalFrames,
        });
        mark("structuredFramesCollected");

        // Normal Stop path (composer Stop calls the same procedure), then the
        // production disposal path that joins the owned child process. This
        // scripted sequence runs in the test body, not only in afterAll.
        const stopEvidence: Record<string, unknown> = {
          interruptedAtMs: Date.now(),
          childPid: structuredChildPid,
        };
        structuredCleanupAttempted = true;
        try {
          await interruptStructuredWorkloadThread({
            cdp,
            threadId: structuredWorkloadSpec.threadId,
          });
          stopEvidence.interruptIssuedAtMs = Date.now();
          // The fixture writes the cancel marker synchronously on
          // `session/cancel`; poll it independently of the status wire so the
          // Stop evidence survives even when a later gate fails.
          const cancelDeadline = Date.now() + 15_000;
          for (;;) {
            const marker = readStructuredWorkloadMarker(structuredMarkers.cancelMarkerPath);
            if (marker !== null) {
              stopEvidence.cancelMarker = marker;
              stopEvidence.cancelMarkerAtMs = Date.now();
              break;
            }
            if (Date.now() >= cancelDeadline) {
              stopEvidence.cancelMarker = null;
              stopEvidence.cancelMarkerTimeoutMs = 15_000;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          // Authoritative settled status: the host's thread-state wire event
          // for the interested client. A structured thread settles as `idle`
          // (renderer vocabulary) or `inactive`; only a not-working state with
          // no attention counts.
          const settledWire = await waitForStructuredWorkloadWireStatus({
            sources: clients,
            threadId: structuredWorkloadSpec.threadId,
            label: "settled after Stop",
            accept: (status) => status.status === "idle" || status.status === "inactive",
            timeoutMs: 60_000,
          });
          stopEvidence.settledWireStatus = settledWire.accepted;
          stopEvidence.settledWireWaitedMs = settledWire.waitedMs;
          try {
            const settledRenderer = await waitForStructuredWorkloadThreadStatus({
              cdp,
              threadId: structuredWorkloadSpec.threadId,
              label: "settled after Stop",
              accept: (status) =>
                status.present && (status.status === "idle" || status.status === "inactive"),
              timeoutMs: 60_000,
            });
            stopEvidence.settledRendererStatus = settledRenderer.accepted.status;
            stopEvidence.settledRendererObserved = settledRenderer.observed;
          } catch (error) {
            stopEvidence.settledRendererError =
              error instanceof Error ? error.message : String(error);
          }
        } catch (error) {
          stopEvidence.interruptError = error instanceof Error ? error.message : String(error);
        }
        try {
          await closeStructuredWorkloadThread({
            cdp,
            threadId: structuredWorkloadSpec.threadId,
          });
          stopEvidence.closeIssuedAtMs = Date.now();
          stopEvidence.childExit = await waitForStructuredWorkloadExit({
            pid: structuredChildPid,
            timeoutMs: 30_000,
          });
          stopEvidence.exitMarker = readStructuredWorkloadMarker(structuredMarkers.exitMarkerPath);
        } catch (error) {
          stopEvidence.closeError = error instanceof Error ? error.message : String(error);
        }
        structuredStopEvidence = stopEvidence;
        writeJson(join(evidenceDir, "structured-stop.json"), stopEvidence);
        mark("structuredStopped");
      }

      const metricsArtifact = buildMetricsArtifact(clients, {
        profile: `v2q-${spec.id}`,
        windowStartedAtMs,
      });
      const clientAccounting = Object.fromEntries(
        [...accounting.entries()].map(([label, value]) => [label, value.snapshot()]),
      );
      // Latency qualification population. Only a *measured* idle population
      // may satisfy a numeric budget; a supported-but-censored idle window is
      // reported as unavailable (never zero, never a budget pass), and the
      // blocked queued-input sample is the positive control, not a routine
      // latency population.
      const latencyPopulation = !inputProtocol
        ? {
            population: "not-applicable",
            numericBudgetEligible: false,
            idleStatus: "not-applicable",
            reasons: [] as readonly string[],
            interactionDuration: null,
          }
        : {
            population:
              trustedInput?.idlePolicy.status === "measured"
                ? "trusted-idle"
                : "unavailable-censored-or-missing",
            numericBudgetEligible: trustedInput?.idlePolicy.numericBudgetEligible ?? false,
            idleStatus: trustedInput?.idlePolicy.status ?? "missing",
            reasons: trustedInput?.idlePolicy.reasons ?? ["trusted-input protocol did not run"],
            interactionDuration:
              trustedInput?.idlePolicy.status === "measured"
                ? (trustedInput.idle.window?.eventTimings.interactionDuration ?? null)
                : null,
          };
      const interactionDuration = latencyPopulation.interactionDuration ?? {
        count: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      };
      const accountingSnapshots = [...accounting.entries()].map(
        ([label, value]) => [label, value.snapshot()] as const,
      );
      // PTY producers emit terminal-output frames only; a zero offscreen
      // verdict is only meaningful once GUI runtime bulk was actually
      // observed. Until a structured-provider fixture exists, the verdict is
      // recorded as null (unexercised) instead of passing vacuously.
      const runtimeBulkEventsObserved = accountingSnapshots.reduce(
        (sum, [, snapshot]) => sum + snapshot.bulkEvents,
        0,
      );
      const terminalFramesObserved = accountingSnapshots.reduce(
        (sum, [, snapshot]) => sum + snapshot.framesByClass.terminal,
        0,
      );
      const interestedLabels = accountingSnapshots
        .map(([label]) => label)
        .filter(
          (label) =>
            // The terminal-only probe client subscribes to one terminal id and
            // never claims GUI item interests, so GUI bulk it receives is not a
            // product leak; the GUI entitlement verdict covers the declared
            // workload clients only.
            label !== legacyLabel && label !== terminalProbeClient?.label,
        );
      const offscreenBulkZeroForInterestedClients =
        runtimeBulkEventsObserved === 0
          ? null
          : interestedLabels.every(
              (label) => (accounting.get(label)?.snapshot().offscreenBulkBytes ?? 0) === 0,
            );
      const budgetVerdicts = {
        latencyPopulation: latencyPopulation.population,
        latencyIdleStatus: latencyPopulation.idleStatus,
        latencyNumericBudgetEligible: latencyPopulation.numericBudgetEligible,
        inputToPaintP95Under50Ms: latencyPopulation.numericBudgetEligible
          ? interactionDuration.p95Ms <= 50
          : null,
        inputToPaintP99Under100Ms: latencyPopulation.numericBudgetEligible
          ? interactionDuration.p99Ms <= 100
          : null,
        noRoutineTaskOver50Ms: (trustedInput?.idle.window?.longTasks.samples ?? 0) === 0,
        blockedPositiveControlLongTasksOver200Ms:
          trustedInput?.blockedPolicy.longTask.over200Ms ?? null,
        offscreenBulkZeroForInterestedClients,
        runtimeBulkEventsObserved,
        terminalFramesObserved,
        structuredCanonicalGuiFrames: structuredFrameEvidence?.total ?? 0,
        guiRuntimeDeltasExercised: structuredWorkloadSpec
          ? (structuredFrameEvidence?.total ?? 0) > 0
          : runtimeBulkEventsObserved > 0,
      };
      const budgetGatePassed =
        !spec.assertBudgets ||
        (latencyPopulation.numericBudgetEligible &&
          budgetVerdicts.inputToPaintP95Under50Ms === true &&
          budgetVerdicts.inputToPaintP99Under100Ms === true &&
          (runtimeBulkEventsObserved === 0 || offscreenBulkZeroForInterestedClients === true));
      expect(budgetGatePassed, `budget verdicts: ${JSON.stringify(budgetVerdicts)}`).toBe(true);

      const memorySummary = memory?.summary() ?? null;
      const hostLoadSummary = hostLoad ? await hostLoad.summary() : null;
      const contamination = buildContaminationRecord(hostLoadSummary);
      const runManifest = {
        cell: spec,
        arm: armRecord,
        environment: {
          platform: platform(),
          release: release(),
          arch: arch(),
          cpuModel: cpus()[0]?.model ?? null,
          cpuCount: cpus().length,
          totalMemBytes: totalmem(),
          freeMemBytes: freemem(),
          loadavgBefore: loadavg(),
          loadavgAfter: loadavg(),
          contamination,
          nodeVersion: process.version,
          electronVersion: armRecord.electronVersion,
        },
        session: {
          root: session.root,
          baseDir: session.baseDir,
          appUrl: session.appUrl,
          cdpPort: session.cdpPort,
          remoteAccessPort: Number(new URL(session.appUrl).port) || null,
          runtimeManifestSha256: fileHash(join(session.root, "runtime-manifest.json")),
          sessionManifestSha256: fileHash(session.sessionFile),
        },
        workload: {
          producers: spec.producers,
          ptyProducers: spec.producers,
          structuredProducers: structuredWorkloadSpec ? 1 : 0,
          producerLinesPerSecond: spec.producers * 20,
          producerApproxBytesPerSecond: spec.producers * 20 * 90,
          clients: spec.clients,
          legacyClient: spec.legacyClient,
          slowClient: spec.slowClient,
          reconnectClient: spec.reconnectClient,
          visibleChatPanes: spec.visibleChatPanes,
          visiblePaneThreadIds: fixture.paneThreadIds,
          structuredProducerVisible: Boolean(structuredWorkloadSpec),
          producerShellEnv:
            spec.producers > 0
              ? "SHELL=/bin/sh (harness-declared login shell for headless PTY producers; avoids interactive prompt-framework terminal queries)"
              : null,
          visibleTerminal: spec.visibleTerminal,
          catalogThreads: spec.catalogThreads,
          durationMs: spec.durationMs,
          protocol: spec.protocol,
          trafficDeclaration: structuredWorkloadSpec
            ? "Two distinct content classes. (1) Structured producer: the deterministic ACP fixture (tests/native-e2e/fixtures/structured-load-agent.mjs) launched by the production supervisor through startThread with an offline-seeded acp-generic instance; its content.delta/item.* events travel supervisor → host → WS and are counted per thread as canonical GUI frames. (2) PTY producers: real supervisor shells (startShell + writeTerminal) declared as provider stand-ins; they emit terminal-output frames only and are accounted separately. No model turn, no credentials, no network, no provider binary."
            : "Synthetic provider streams are real supervisor PTYs (startShell + writeTerminal) declared as provider stand-ins; no model turn runs. PTY producers emit terminal-output frames only and do NOT generate GUI runtime deltas, so the offscreen-bulk/interest-filter measurement is recorded as unexercised in these cells (structuredCanonicalGuiFrames=0). The deterministic structured ACP fixture exists (tests/native-e2e/fixtures/structured-load-agent.mjs) and is exercised by cells whose spec carries a structuredWorkload block.",
          structuredWorkload: structuredWorkloadSpec
            ? {
                instanceId: structuredWorkloadSpec.instanceId,
                threadId: structuredWorkloadSpec.threadId,
                prompt: structuredWorkloadSpec.prompt,
                minCanonicalFrames: structuredWorkloadSpec.minCanonicalFrames,
                params: structuredParams ?? null,
                paramsHash: structuredParams ? structuredWorkloadHash(structuredParams) : null,
                fixturePath: STRUCTURED_WORKLOAD_FIXTURE_PATH,
                fixtureSha256: structuredWorkloadFixtureSha256(),
                seed: structuredSeedEvidence
                  ? {
                      settingsPath: structuredSeedEvidence.settingsPath,
                      settingsSha256: structuredSeedEvidence.settingsSha256,
                      seedPathMatchesProfile: structuredSeedEvidence.seedPathMatchesProfile,
                      instance: structuredSeedEvidence.instance,
                    }
                  : null,
              }
            : null,
        },
        results: {
          timeline,
          fixtureStore: fixtureStore ?? null,
          paneVerification,
          producerVerification,
          producerStart: producerStartEvidence,
          producerDiagnosis,
          finalProducerCheck,
          producerLinesAtEnd: finalProducerCheck.samples.map((sample) => sample.ticks),
          clientsBefore,
          metrics: metricsArtifact,
          clientAccounting,
          observerPreflight: preflightObserver,
          steadyWindow: steadyEvidence,
          protocol: protocolEvidence,
          trustedInput: trustedInput
            ? {
                options: trustedInput.options,
                foreground: trustedInput.foreground,
                idlePolicy: trustedInput.idlePolicy,
                blockedPolicy: trustedInput.blockedPolicy,
                policy: trustedInput.policy,
                idle: {
                  dispatch: trustedInput.idle.dispatch,
                  barrier: trustedInput.idle.barrier,
                  phaseEvents: trustedInput.idle.phaseEvents,
                  rafFramesDuringPhase: trustedInput.idle.rafFramesDuringPhase,
                  paintFramesPerSecond: trustedInput.idle.paintFramesPerSecond,
                  durationMs: trustedInput.idle.durationMs,
                },
                blocked: {
                  cycles: trustedInput.blocked.cycles,
                  dispatch: trustedInput.blocked.dispatch,
                  barrier: trustedInput.blocked.barrier,
                  phaseEvents: trustedInput.blocked.phaseEvents,
                  rafFramesDuringPhase: trustedInput.blocked.rafFramesDuringPhase,
                  durationMs: trustedInput.blocked.durationMs,
                },
              }
            : null,
          latencyPopulation,
          slowClient: slowClientEvidence ?? null,
          reconnectClient: reconnectClientEvidence ?? null,
          controlLatency: {
            samples: controlLatencies.length,
            maxMs: controlLatencies.length > 0 ? Math.max(...controlLatencies) : null,
          },
          memory: memorySummary,
          processCpu: cpu?.summary() ?? null,
          nodePerf: summarizeNodePerfDirectory(join(OUT_DIR, "perf")),
          budgetVerdicts,
          structuredWorkload: structuredWorkloadSpec
            ? {
                launch: structuredLaunch ?? null,
                wireStatus: structuredWireStatus ?? null,
                rendererStatus: structuredReadyStatus ?? null,
                frames: structuredFrameEvidence,
                frameError: structuredFrameError,
                stop: structuredStopEvidence ?? null,
              }
            : null,
          renderedText: {
            structuredMarkerPrefix: structuredParams?.marker ?? null,
            structuredBefore: structuredRenderedBefore,
            structuredAfter: structuredRenderedAfter,
            structuredAdvanced: structuredTextAdvanced,
          },
          visibleTerminalPanel:
            spec.terminalSurface === "panel"
              ? {
                  open: terminalPanelOpen ?? null,
                  foreground: terminalForeground ?? null,
                  discovery: terminalShellDiscovery ?? null,
                  startPath: terminalStartPath ?? null,
                  bindInitial: terminalShellBindInitial ?? null,
                  bindAfterReopen: terminalShellRebind ?? null,
                  reopen: terminalPanelReopen ?? null,
                  rediscovery: terminalShellRediscovery ?? null,
                  probeAfter: terminalShellProbeAfter ?? null,
                  commands: terminalCommands ?? null,
                  firstDelivery: terminalFirstDelivery ?? null,
                  secondDelivery: terminalSecondDelivery ?? null,
                  firstOutput: terminalWaitFirst ?? null,
                  secondOutput: terminalWaitSecond ?? null,
                  productionDefect: terminalProductionDefect,
                  // PTY generation stability after delivery: any replacement is
                  // a harness-generation-mismatch, never a hydration failure.
                  generationStability: {
                    first: terminalGenerationStabilityFirst ?? null,
                    second: terminalGenerationStabilitySecond ?? null,
                  },
                  // Functional terminal gate vs the ordinary keyboard journey:
                  // `passed` is true only when trusted keyboard typing itself
                  // advanced the PTY for both commands; a writeTerminal
                  // fallback never counts as the keyboard or first-open journey.
                  keyboardJourney: {
                    first: terminalFirstDelivery?.deliveryJourney ?? null,
                    second: terminalSecondDelivery?.deliveryJourney ?? null,
                    firstOpenPassed: terminalFirstDelivery?.keyboardJourneyPassed === true,
                    passed:
                      terminalFirstDelivery?.keyboardJourneyPassed === true &&
                      terminalSecondDelivery?.keyboardJourneyPassed === true,
                  },
                  verdict:
                    terminalProductionDefect === null
                      ? "rendered-pass"
                      : "production-defect-reported",
                  domText: terminalDomText ?? null,
                  surface: terminalSurfaceEvidence ?? null,
                }
              : null,
          paneScreenshots,
          consoleErrors: {
            count: cdp
              .consoleLog()
              .filter((entry) => entry.level === "error" || entry.kind === "exception").length,
            firstThree: cdp
              .consoleLog()
              .filter((entry) => entry.level === "error" || entry.kind === "exception")
              .slice(0, 3),
          },
        },
        evidence: {
          armRecord: join(evidenceDir, "arm-record.json"),
          visiblePanes: join(evidenceDir, "visible-panes.json"),
          producers: join(evidenceDir, "producers.json"),
          observerPreflight: join(evidenceDir, "observer-preflight.json"),
          observerPreflightSnapshot: join(evidenceDir, "observer-preflight-snapshot.json"),
          protocolSnapshots: join(evidenceDir, "protocol-snapshots.json"),
          trustedInputProtocol: join(evidenceDir, "trusted-input-protocol.json"),
          rendererConsole: join(evidenceDir, "renderer-console.json"),
          teardown: join(evidenceDir, "teardown.json"),
          nodePerfDirectory: join(OUT_DIR, "perf"),
          naturalBoot: join(evidenceDir, "natural-boot.json"),
          fixtureStore: join(evidenceDir, "fixture-store.json"),
          structuredSeed: structuredWorkloadSpec ? join(evidenceDir, "structured-seed.json") : null,
          structuredLaunch: structuredWorkloadSpec
            ? join(evidenceDir, "structured-launch.json")
            : null,
          structuredFrames: structuredWorkloadSpec
            ? join(evidenceDir, "structured-frames.json")
            : null,
          structuredStop: structuredWorkloadSpec ? join(evidenceDir, "structured-stop.json") : null,
          segmentedIdle: join(evidenceDir, "segmented-idle.json"),
          renderedSurfaces: join(evidenceDir, "rendered-surfaces.json"),
          terminalPanelOpen:
            spec.terminalSurface === "panel" ? join(evidenceDir, "terminal-panel-open.json") : null,
          terminalPanelAdvance:
            spec.terminalSurface === "panel"
              ? join(evidenceDir, "terminal-panel-advance.json")
              : null,
          structuredRendered: structuredWorkloadSpec
            ? join(evidenceDir, "structured-rendered.json")
            : null,
        },
      };
      const manifestPath = join(OUT_DIR, "run.json");
      writeJson(manifestPath, runManifest);
      runManifestWritten = true;
      console.log(
        `[v2q:${spec.id}] producers=${String(spec.producers)} clients=${String(spec.clients)} ` +
          `steady=${String(spec.durationMs)}ms inputToPaint.p95=${String(interactionDuration.p95Ms)}ms ` +
          `eventTimings.idle=${String(protocolEvidence.idle?.eventTimings.samples ?? 0)} ` +
          `longTasks.blocked=${String(protocolEvidence.blocked?.longTasks.samples ?? 0)} ` +
          `longTasks.over200ms=${String(protocolEvidence.blocked?.longTasks.over200Ms ?? 0)} ` +
          `structuredGuiFrames=${String(structuredFrameEvidence?.total ?? 0)} ` +
          `offscreenBulk=${String(clientAccounting["v2q-c01"]?.offscreenBulkBytes ?? 0)}B -> ${manifestPath}`,
      );

      expect(finalProducerCheck.verified).toBe(spec.producers);
      for (const client of [...clients, ...retiredClients]) {
        expect(client.metrics.eventSeqGaps).toBe(0);
      }
      expect(
        !inputProtocol ||
          trustedInput?.idlePolicy.status === "measured" ||
          trustedInput?.blockedPolicy.queued.eventTiming !== null,
        "trusted-input cells must report at least one interaction-level duration sample; absence is a missing measurement, not a zero",
      ).toBe(true);
      expect(
        spec.protocol !== "longtask" ||
          trustedInput?.blockedPolicy.contrast.blockedMaxInputDelayMs !== null,
        "long-task cells must report a blocked-phase input delay maximum",
      ).toBe(true);
      expect(
        !structuredWorkloadSpec || structuredFrameError === null,
        `structured producer must emit canonical GUI frames: ${structuredFrameError ?? "ok"}`,
      ).toBe(true);
      expect(
        !structuredWorkloadSpec ||
          (structuredFrameEvidence?.total ?? 0) >= structuredWorkloadSpec.minCanonicalFrames,
        `structured producer canonical GUI frames: ${String(
          structuredFrameEvidence?.total ?? 0,
        )}/${String(structuredWorkloadSpec?.minCanonicalFrames ?? 0)}`,
      ).toBe(true);
      expect(
        !structuredWorkloadSpec || structuredStopEvidence?.cancelMarker === "1",
        "Stop must reach the fixture as session/cancel (cancel marker written)",
      ).toBe(true);
      expect(
        !structuredWorkloadSpec ||
          (["idle", "inactive"] as const).includes(
            String(
              (
                structuredStopEvidence?.settledWireStatus as
                  | { readonly status?: unknown }
                  | undefined
              )?.status,
            ) as "idle" | "inactive",
          ),
        "stopped structured thread must settle idle/inactive on the authoritative wire status",
      ).toBe(true);
      expect(
        !structuredWorkloadSpec || structuredStopEvidence?.childExit !== undefined,
        "fixture child must be joined after production disposal (pid exit observed)",
      ).toBe(true);
      // Rendered structured text: the fixture's chunk markers must be present
      // in the pane DOM and must advance during the measured window. Wire frame
      // counts alone are not accepted as rendered-text evidence.
      expect(
        !structuredWorkloadSpec || structuredTextAdvanced,
        `structured text must render and advance in the pane DOM (before=${JSON.stringify(
          structuredRenderedBefore && {
            count: structuredRenderedBefore.matchCount,
            max: structuredRenderedBefore.maxTextIndex,
          },
        )}, after=${JSON.stringify(
          structuredRenderedAfter && {
            count: structuredRenderedAfter.matchCount,
            max: structuredRenderedAfter.maxTextIndex,
          },
        )})`,
      ).toBe(true);
      // Visible terminal: the integrated panel's app-owned shell must render
      // real typed-command output twice (advance), the PTY generation must stay
      // bound across the window, and the text must be readable from the DOM.
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalFirstDelivery?.echoObserved === true &&
            terminalSecondDelivery?.echoObserved === true),
        `both terminal commands must reach the app-owned PTY (first=${JSON.stringify(
          terminalFirstDelivery && {
            method: terminalFirstDelivery.method,
            echo: terminalFirstDelivery.echoObserved,
          },
        )}, second=${JSON.stringify(
          terminalSecondDelivery && {
            method: terminalSecondDelivery.method,
            echo: terminalSecondDelivery.echoObserved,
          },
        )})`,
      ).toBe(true);
      // Rendered terminal text: both typed-command outputs must be readable in
      // the DOM, or the exact production-defect signature must be recorded (the
      // PTY received/echoed both commands, an independent host watch received
      // the shell's terminal-output frames, and the surface still did not paint
      // them). A silent waive is not allowed; the defect is first-class evidence.
      const terminalDefectEvidenceValid =
        terminalProductionDefect !== null &&
        terminalFirstDelivery?.echoObserved === true &&
        terminalSecondDelivery?.echoObserved === true &&
        (terminalLiveStreamingProbe?.clientTerminalFrames ?? 0) > 0 &&
        (terminalLiveStreamingProbe?.retainedScrollbackBytes ?? 0) > 0;
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalWaitFirst?.found === true && terminalWaitSecond?.found === true) ||
          terminalDefectEvidenceValid,
        `visible terminal must render both typed command outputs or record the production defect with its exact signature (first=${String(
          terminalWaitFirst?.found,
        )}, second=${String(terminalWaitSecond?.found)}, defect=${JSON.stringify(terminalProductionDefect)})`,
      ).toBe(true);
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalShellProbeAfter?.probe?.generation !== null &&
            terminalShellProbeAfter?.probe?.generation !== undefined &&
            terminalShellProbeAfter.probe.generation === terminalShellBind?.probe?.generation &&
            (terminalShellProbeAfter.probe.toCursor ?? 0) >
              (terminalShellBind?.probe?.toCursor ?? 0)),
        `visible terminal PTY generation/cursor must stay bound and advance (bind=${JSON.stringify(
          terminalShellBind?.probe ?? null,
        )}, after=${JSON.stringify(terminalShellProbeAfter?.probe ?? null)})`,
      ).toBe(true);
      // The visible terminal must come from the app's own deferred start: a
      // raw supervisor `startShell` stand-in leaves the panel's deferred start
      // armed and a later fit replaces the tested generation.
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalStartPath?.appOwnedDeferredStart === true &&
            terminalStartPath.harnessFallbackAttempted === false),
        `visible terminal must use the app's own deferred start with no raw startShell fallback: ${JSON.stringify(
          terminalStartPath,
        )}`,
      ).toBe(true);
      // Generation stability after command delivery is a harness invariant: a
      // replacement would have been classified harness-generation-mismatch and
      // thrown above; this gate makes the recorded evidence authoritative.
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalGenerationStabilityFirst?.stable === true &&
            terminalGenerationStabilitySecond?.stable === true),
        `visible terminal PTY generation must stay stable after command delivery (first=${JSON.stringify(
          terminalGenerationStabilityFirst,
        )}, second=${JSON.stringify(terminalGenerationStabilitySecond)})`,
      ).toBe(true);
      expect(
        spec.terminalSurface !== "panel" ||
          (terminalDomText?.rendererAfter === "dom-rows" && (terminalDomText?.length ?? 0) > 0),
        `visible terminal rendered text must be readable from the DOM (renderer=${String(
          terminalDomText?.rendererAfter,
        )}, length=${String(terminalDomText?.length)})`,
      ).toBe(true);
      expect(
        paneScreenshots.length === 0 ||
          paneScreenshots.every((shot) => (shot.bytes ?? 0) > 0 && shot.error === null),
        `live pane screenshots must capture non-empty images: ${JSON.stringify(
          paneScreenshots.map((shot) => ({
            selector: shot.selector,
            bytes: shot.bytes,
            error: shot.error,
          })),
        )}`,
      ).toBe(true);
      expect(existsSync(manifestPath)).toBe(true);
    },
    (cell?.durationMs ?? 120_000) + 300_000,
  );
});
