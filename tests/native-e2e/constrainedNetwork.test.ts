import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createConnection, createServer, type Socket } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../src/shared/remote/protocol.ts";
import { LOOPBACK_HOST } from "./harness/constants.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import {
  missingServerArtifactBlocker,
  startRealHost,
  type RealHostHandle,
} from "./harness/realHost.ts";
import { ProfileClient, type ReceivedEvent } from "./helpers/concurrencyProfileClient.ts";
import {
  describeArtifact,
  observeSources,
  summarizeProvenance,
} from "./helpers/experimentArtifacts.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import { buildMetricsArtifact } from "./helpers/profileMetrics.ts";
import {
  expectOk,
  posixLocation,
  renameProjectAndAwaitFanout,
  writeAndReadBackNotes,
  type WorkloadProject,
} from "./helpers/sharedHostWorkload.ts";
import {
  ConstrainedTcpProxy,
  type ProxyStats,
  type ShaperProfile,
} from "./helpers/constrainedTcpProxy.ts";

/**
 * Constrained-network experiment against ONE prebuilt production
 * `dist/main/server.cjs` (see BUILD_PROVENANCE_NOTE): a small
 * loopback-only TCP shaper (helpers/constrainedShaper.ts +
 * helpers/constrainedTcpProxy.ts) imposes deterministic one-way delay plus
 * per-byte serialization on the real HTTP + WS data plane. No OS firewall,
 * interface, or system network setting is touched; no packet loss is claimed.
 *
 * Profiles: RTT 150ms/1Mbps, 600ms/128kbps, 1500ms/32kbps — every phase runs
 * at every profile (timeouts are scaled to the imposed link, never skipped):
 *  - HTTP authority: snapshot read, project rename, notes write/read-back —
 *    exact content fidelity through the constrained link.
 *  - WS: fan-out + ping on the impaired stream while a healthy neighbor works
 *    concurrently over a direct connection (same device credential).
 *  - Disconnect/replay: mid-stream relay teardown while impaired, mutations
 *    accumulate, reconnect through the shaper with lastSeenSeq — contiguous
 *    seq, replay accounting, offline renames in order, notes content exact.
 *  - Pacing proof: a known payload sized to 0.5s of link time travels both
 *    directions byte-exact; measured wire throughput must respect the imposed
 *    rate (serialization-aware window).
 *  - Shaper calibration: a ≥64KiB known payload crosses a loopback echo path
 *    through the shaper — fidelity by sha256 plus measured bandwidth/delay —
 *    so the profiles are a calibrated link model, not header-latency claims.
 *
 * Assertions are functional invariants plus instrument-envelope checks on the
 * shaper itself. App latency/throughput are measured and recorded, never
 * asserted against a performance budget. Wire bytes (proxy) and decoded
 * payload bytes (ProfileClient) are recorded side by side so snapshot
 * compression on the constrained link is quantifiable without production
 * changes. Pacing scope: the rate applies per connection — aggregate physical
 * bandwidth across concurrent connections is not modeled. Evidence:
 * tmp/v2-production-review/constrained-network/.
 */

const repoRoot = findRepoRoot();
const entrypoint = detectHeadlessServerEntrypoint(repoRoot);

const SEED_PROJECT_NAME = "native-e2e-fixture";
const CALIBRATION_PAYLOAD_BYTES = 256 * 1024;
const OFFLINE_RENAMES = 3;
const LINK_WINDOW_TOLERANCE = 1.15;

const PROFILES: readonly ShaperProfile[] = [
  { name: "rtt150ms-1mbps", rttMs: 150, bitsPerSecond: 1_000_000 },
  { name: "rtt600ms-128kbps", rttMs: 600, bitsPerSecond: 128_000 },
  { name: "rtt1500ms-32kbps", rttMs: 1500, bitsPerSecond: 32_000 },
];

const PROFILE_TEST_TIMEOUT_MS: Record<string, number> = {
  "rtt150ms-1mbps": 240_000,
  "rtt600ms-128kbps": 300_000,
  "rtt1500ms-32kbps": 420_000,
};

const BUILD_PROVENANCE_NOTE = {
  requiresBuildProvenance: true,
  buildNote:
    "This suite uses a prebuilt backend and performs no rebuild. Match build.json " +
    "to the build log before attributing results to source changes. Inspect " +
    "hostLoad.json for concurrent workload; per-connection pacing is not a shared link.",
};

const EVIDENCE_ACCOUNTING =
  "wireBytes = actual socket bytes forwarded by the constrained proxy for the " +
  "operation window (HTTP headers + WS upgrade/framing included, TCP/IP excluded); " +
  "decodedBytes = ProfileClient HTTP body bytes after content-encoding decode. The " +
  "decoded/wire ratio therefore reflects transport compression, not an exact " +
  "payload-only comparison.";

const SECRET_PATTERN = /lc_(pair|access|ws)_[A-Za-z0-9_-]+/u;

function writeEvidence(fileName: string, payload: unknown): string {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  if (SECRET_PATTERN.test(serialized)) {
    throw new Error(`refusing to write evidence ${fileName}: secret-shaped material detected`);
  }
  const dir = join(repoRoot, "tmp", "v2-production-review", "constrained-network");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, fileName);
  writeFileSync(path, `${serialized}\n`, { mode: 0o600 });
  return path;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deadline for waiting on the impaired stream: two imposed one-way delays per
 * hop plus generous server-side processing slack. */
function impairedDeadlineMs(profile: ShaperProfile): number {
  return 2 * profile.rttMs + 20_000;
}

let cleanup: ProcessCleanup | undefined;
let host: RealHostHandle | undefined;
let project: WorkloadProject | undefined;
let warmupColdGitStatusMs = 0;
let provenance: ReturnType<typeof describeArtifact> | undefined;
let sampler: HostLoadSampler | undefined;
let runStartedAtIso: string | undefined;
let calibration: Record<string, unknown> | null = null;

function workloadProject(): WorkloadProject {
  if (!project) throw new Error("project fixture was not discovered");
  return project;
}

function wireDelta(
  before: ProxyStats,
  after: ProxyStats,
  direction: "clientToServer" | "serverToClient",
): number {
  return Math.max(0, after[direction].bytesForwarded - before[direction].bytesForwarded);
}

/**
 * Calibrates the shaper itself on a loopback echo path with a known ≥64KiB
 * payload: byte-exact fidelity by sha256, imposed bandwidth by measured wire
 * throughput, imposed delay by a small-request round trip. This is what makes
 * the per-profile numbers a calibrated link model rather than a hope.
 */
async function runCalibration(): Promise<Record<string, unknown>> {
  const profile = PROFILES[0];
  if (!profile) throw new Error("calibration: no profile available");
  const oneWayDelayMs = profile.rttMs / 2;
  const echoSockets = new Set<Socket>();
  const echo = createServer((socket) => {
    echoSockets.add(socket);
    socket.on("data", (chunk: Buffer) => {
      if (!socket.write(chunk)) {
        socket.pause();
        socket.once("drain", () => socket.resume());
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    echo.once("error", reject);
    echo.listen(0, LOOPBACK_HOST, () => resolve());
  });
  const echoAddress = echo.address();
  if (!echoAddress || typeof echoAddress === "string") throw new Error("calibration echo port");
  const proxy = await ConstrainedTcpProxy.start({
    label: "calibration",
    upstreamHost: LOOPBACK_HOST,
    upstreamPort: echoAddress.port,
    oneWayDelayMs,
    bytesPerSecond: profile.bitsPerSecond / 8,
  });
  let calibrationClient: Socket | null = null;
  try {
    const socket = createConnection({ host: LOOPBACK_HOST, port: proxy.port });
    calibrationClient = socket;
    if (!socket) throw new Error("calibration: failed to open the loopback client socket");
    const payload = Buffer.from(
      Buffer.alloc(CALIBRATION_PAYLOAD_BYTES, 0).map((_, index) => index % 251),
    );
    const sentHash = createHash("sha256").update(payload).digest("hex");

    // Imposed delay: one small round trip through the shaped path.
    const probeSentAtMs = Date.now();
    socket.write("p\n");
    const probe = await new Promise<Buffer>((resolve, reject) => {
      const received: Buffer[] = [];
      const onChunk = (chunk: Buffer): void => {
        received.push(chunk);
        if (Buffer.concat(received).length >= 2) {
          socket.off("data", onChunk);
          resolve(Buffer.concat(received).subarray(0, 2));
        }
      };
      socket.on("data", onChunk);
      socket.once("error", reject);
      setTimeout(() => reject(new Error("calibration probe never echoed")), 10_000).unref();
    });
    const probeRttMs = Date.now() - probeSentAtMs;
    assert(probe.toString("utf8") === "p\n", "calibration probe must echo byte-exact");
    assert(
      probeRttMs >= 2 * oneWayDelayMs - 40,
      `probe RTT ${String(probeRttMs)}ms must be at least the imposed 2×${String(oneWayDelayMs)}ms delay`,
    );

    // Imposed bandwidth + fidelity: one known payload through the shaped path,
    // with the client HALF-CLOSING its request side (socket.end). The shaper
    // must forward the full paced echo back to the half-closed client before
    // propagating the echo server's FIN — truncation here fails the run.
    const payloadSentAtMs = Date.now();
    const received: Buffer[] = [];
    let endedCleanly = false;
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      const deadline = setTimeout(
        () => reject(new Error("calibration payload never completed")),
        (CALIBRATION_PAYLOAD_BYTES * 8000) / profile.bitsPerSecond + 30_000,
      );
      deadline.unref();
      socket.once("end", () => {
        endedCleanly = true;
      });
      const onChunk = (chunk: Buffer): void => {
        received.push(chunk);
        const total = received.reduce((sum, part) => sum + part.length, 0);
        if (total < payload.length) return;
        socket.off("data", onChunk);
        clearTimeout(deadline);
        resolve();
      };
      socket.on("data", onChunk);
      socket.end(payload);
    });
    const payloadElapsedMs = Date.now() - payloadSentAtMs;
    const echoed = Buffer.concat(received).subarray(0, payload.length);
    // The propagated FIN follows the last paced byte; give it a bounded grace.
    await new Promise<void>((resolve) => {
      if (endedCleanly) {
        resolve();
        return;
      }
      socket.once("end", () => resolve());
      setTimeout(resolve, 5_000).unref();
    });
    assert(
      endedCleanly,
      "half-closed client must observe the echoed payload before the propagated FIN",
    );
    assert(
      createHash("sha256").update(echoed).digest("hex") === sentHash,
      "calibration payload must survive the shaper byte-exact",
    );
    const stats = proxy.stats();
    const serializationFloorMs = Math.ceil(
      (CALIBRATION_PAYLOAD_BYTES * 1000) / (profile.bitsPerSecond / 8),
    );
    assert(
      payloadElapsedMs >= serializationFloorMs - 100,
      `payload transfer ${String(payloadElapsedMs)}ms must respect the ${String(serializationFloorMs)}ms serialization floor`,
    );
    const measuredBitsPerSecond = stats.serverToClient.effectiveBitsPerSecond ?? 0;
    assert(
      measuredBitsPerSecond <= profile.bitsPerSecond * LINK_WINDOW_TOLERANCE,
      `measured wire throughput ${String(measuredBitsPerSecond)}bps must respect the imposed ${String(profile.bitsPerSecond)}bps`,
    );
    assert(
      measuredBitsPerSecond >= profile.bitsPerSecond * 0.5,
      `measured wire throughput ${String(measuredBitsPerSecond)}bps must actually carry the imposed rate`,
    );
    return {
      profile: { ...profile, oneWayDelayMs },
      payloadBytes: CALIBRATION_PAYLOAD_BYTES,
      probeRttMs,
      payloadElapsedMs,
      serializationFloorMs,
      measuredBitsPerSecond,
      fidelity: "sha256-exact",
      halfClose: "client socket.end(payload); full echo delivered before propagated FIN",
      accounting: stats.accounting,
    };
  } finally {
    calibrationClient?.destroy();
    proxy.teardownRelays("calibration-end");
    await proxy.close();
    echo.close();
    for (const echoSocket of echoSockets) echoSocket.destroy();
  }
}

describe.skipIf(!entrypoint)(
  "constrained-network impairment on prebuilt dist/main/server.cjs (INTERIM binary)",
  () => {
    beforeAll(async () => {
      if (!entrypoint) throw new Error(missingServerArtifactBlocker(repoRoot).message);
      cleanup = new ProcessCleanup();
      const port = await allocateLoopbackPort();
      host = await startRealHost({
        host: LOOPBACK_HOST,
        port,
        repoRoot,
        cleanup,
        startupTimeoutMs: 120_000,
        baseDirRoot: join(repoRoot, "tmp", ".tmp", "constrained-network-qa"),
      });
      assert(
        !host.blockers.some((blocker) => blocker.code === "pair-json-unavailable"),
        "machine-readable pairing (pair --json) is unavailable on this host",
      );
      const environment = await fetch(
        new URL("/.well-known/poracode/environment", host.httpBaseUrl),
      );
      assert.strictEqual(environment.status, 200, "environment endpoint must respond 200");
      const descriptor = (await environment.json()) as { protocolVersion: number };
      assert.strictEqual(
        descriptor.protocolVersion,
        PORACODE_REMOTE_PROTOCOL_VERSION,
        "server must speak the current remote protocol version",
      );

      sampler = new HostLoadSampler();
      sampler.start(2_000);
      runStartedAtIso = new Date().toISOString();
      provenance = describeArtifact(entrypoint, observeSources(repoRoot));
      writeEvidence("build.json", provenance);

      // Bootstrap over the direct link: discover the seeded project and warm
      // the supervisor (cold git status recorded separately, excluded from
      // any constrained-link numbers).
      const bootstrapCredential = await acquireDeviceCredential(host, "bootstrap");
      const bootstrap = await ProfileClient.create({
        handle: host,
        label: "bootstrap",
        accessToken: bootstrapCredential.accessToken,
      });
      try {
        const snapshot = await bootstrap.fetchJson("snapshot-read", "/api/snapshot");
        expectOk(snapshot.status, "bootstrap snapshot", snapshot.body);
        const projects =
          (snapshot.body as { projects?: Array<Record<string, unknown>> }).projects ?? [];
        const seeded = projects.find((entry) => entry.name === SEED_PROJECT_NAME);
        assert(seeded, `seeded project ${SEED_PROJECT_NAME} must exist`);
        const location = seeded?.location as { kind?: string; path?: string } | undefined;
        project = {
          projectId: String(seeded?.id),
          locationPath: String(location?.path),
        };
        assert.strictEqual(
          project.locationPath,
          join(host.baseDir, "fixture-repo"),
          "seeded project must live in the isolated fixture repo",
        );
        const cold = await bootstrap.gitProcedure("git-status-cold", "getGitStatus", {
          projectLocation: posixLocation(workloadProject()),
        });
        expectOk(cold.status, "warmup getGitStatus", cold.body);
        warmupColdGitStatusMs = cold.elapsedMs;
        await bootstrap.ping();
      } finally {
        await bootstrap.close();
      }
    }, 240_000);

    afterAll(async () => {
      try {
        sampler?.stop();
        if (sampler && runStartedAtIso) {
          writeEvidence("hostLoad.json", {
            runStartedAtIso,
            runFinishedAtIso: new Date().toISOString(),
            ...sampler.summary(),
            environment: BUILD_PROVENANCE_NOTE.buildNote,
            samples: sampler.allSamples(),
          });
        }
      } finally {
        await host?.stop();
        host = undefined;
        await cleanup?.shutdown("experiment-end");
        cleanup = undefined;
      }
    }, 60_000);

    it("calibrates the shaper on a loopback echo path (256KiB known payload)", async () => {
      calibration = await runCalibration();
      const path = writeEvidence("calibration.json", calibration);
      console.log(`[constrained] calibration → ${path}`);
      expect((calibration.measuredBitsPerSecond as number) ?? 0).toBeGreaterThan(0);
    }, 120_000);

    for (const profile of PROFILES) {
      const tag = profile.name;
      it(
        `impaired control plane, WS fan-out, pacing, and replay at ${tag}`,
        async () => {
          if (!host) throw new Error("real host was not started");
          const oneWayDelayMs = profile.rttMs / 2;
          const proxy = await ConstrainedTcpProxy.start({
            label: tag,
            upstreamHost: LOOPBACK_HOST,
            upstreamPort: host.hostPort,
            oneWayDelayMs,
            bytesPerSecond: profile.bitsPerSecond / 8,
          });
          const windowStartedAtMs = Date.now();
          // Pairing/token exchange stays direct: device provisioning is not
          // part of the impaired data plane.
          const credential = await acquireDeviceCredential(host, `cn-${tag}`);
          const impairedHandle = proxy.wrapHandle(host);
          let impaired: ProfileClient | undefined;
          let healthy: ProfileClient | undefined;
          let replayed: ProfileClient | undefined;
          try {
            // Ticket + WS upgrade cross the constrained link.
            impaired = await ProfileClient.create({
              handle: impairedHandle,
              label: `cn-${tag}-impaired`,
              accessToken: credential.accessToken,
            });
            healthy = await ProfileClient.create({
              handle: host,
              label: `cn-${tag}-healthy`,
              accessToken: credential.accessToken,
            });

            // Phase A — HTTP authority under impairment.
            const beforeSnapshot = proxy.stats();
            const bodyBeforeSnapshot = impaired.metrics.httpResponseBodyBytes;
            const snapshotStartedAtMs = Date.now();
            const snapshot = await impaired.fetchJson("snapshot-read", "/api/snapshot");
            const snapshotRoundTripMs = Date.now() - snapshotStartedAtMs;
            expectOk(snapshot.status, "impaired snapshot read", snapshot.body);
            assert(
              snapshotRoundTripMs >= 2 * oneWayDelayMs - 60,
              `snapshot round trip ${String(snapshotRoundTripMs)}ms must reflect the imposed 2×${String(oneWayDelayMs)}ms delay`,
            );
            const afterSnapshot = proxy.stats();
            const snapshotWire = {
              decodedResponseBytes: impaired.metrics.httpResponseBodyBytes - bodyBeforeSnapshot,
              wireRequestBytes: wireDelta(beforeSnapshot, afterSnapshot, "clientToServer"),
              wireResponseBytes: wireDelta(beforeSnapshot, afterSnapshot, "serverToClient"),
              accounting: EVIDENCE_ACCOUNTING,
            };

            const renameA = `${SEED_PROJECT_NAME}-cn-${tag}-a`;
            const fanoutA = await renameProjectAndAwaitFanout(
              impaired,
              [impaired, healthy],
              workloadProject(),
              renameA,
            );
            const notesDoc = { constrained: tag, writtenAt: Date.now() };
            const notesRead = await writeAndReadBackNotes(impaired, workloadProject(), notesDoc);
            assert.deepStrictEqual(
              notesRead,
              notesDoc,
              "notes must read back exactly through the constrained link",
            );
            const persisted = await impaired.fetchJson("snapshot-read-persisted", "/api/snapshot");
            expectOk(persisted.status, "impaired persisted snapshot", persisted.body);
            const persistedProjects =
              (persisted.body as { projects?: Array<Record<string, unknown>> }).projects ?? [];
            assert(
              persistedProjects.some(
                (entry) => entry.id === workloadProject().projectId && entry.name === renameA,
              ),
              "rename must persist authoritatively for the impaired reader",
            );

            // Phase B — WS fan-out + ping while the healthy neighbor works.
            const renameB = `${SEED_PROJECT_NAME}-cn-${tag}-b`;
            const neighborSnapshot = impaired.fetchJson("snapshot-under-neighbor", "/api/snapshot");
            const fanoutB = await renameProjectAndAwaitFanout(
              healthy,
              [healthy, impaired],
              workloadProject(),
              renameB,
            );
            const underNeighbor = await neighborSnapshot;
            expectOk(
              underNeighbor.status,
              "impaired snapshot under neighbor load",
              underNeighbor.body,
            );
            await impaired.ping();
            await healthy.ping();
            const impairedPingRttMs = impaired.metrics.wsPingRttMs.at(-1) ?? 0;
            assert(
              impairedPingRttMs >= 2 * oneWayDelayMs - 40,
              `impaired WS ping RTT ${String(impairedPingRttMs)}ms must reflect the imposed 2×${String(oneWayDelayMs)}ms delay`,
            );

            // Phase C — paced transfer both directions, byte-exact.
            const payloadBytes = Math.round((profile.bitsPerSecond / 8) * 0.5);
            const pattern = "constrained-network-payload-0123456789abcdef;";
            const content = pattern
              .repeat(Math.ceil(payloadBytes / pattern.length))
              .slice(0, payloadBytes);
            const relativePath = `constrained-network/${tag}.txt`;
            const location = posixLocation(workloadProject());
            const created = await impaired.gitProcedure("git-create-file", "createProjectEntry", {
              projectLocation: location,
              path: relativePath,
              type: "file",
            });
            expectOk(created.status, `createProjectEntry ${relativePath}`, created.body);
            const baseline = await impaired.gitProcedure("git-read-file", "readProjectFile", {
              projectLocation: location,
              path: relativePath,
            });
            expectOk(baseline.status, `readProjectFile baseline ${relativePath}`, baseline.body);
            const modifiedAtMs = (baseline.body as { modifiedAtMs?: number }).modifiedAtMs;
            assert(typeof modifiedAtMs === "number", "file read must include modification time");
            const beforeUpload = proxy.stats();
            const uploadStartedAtMs = Date.now();
            const written = await impaired.gitProcedure("git-write-file", "writeProjectFile", {
              projectLocation: location,
              path: relativePath,
              content,
              baseModifiedAtMs: modifiedAtMs,
            });
            const uploadWindowMs = Date.now() - uploadStartedAtMs;
            expectOk(written.status, `writeProjectFile ${relativePath}`, written.body);
            const beforeDownload = proxy.stats();
            const downloadStartedAtMs = Date.now();
            const readBack = await impaired.gitProcedure("git-read-file-back", "readProjectFile", {
              projectLocation: location,
              path: relativePath,
            });
            const downloadWindowMs = Date.now() - downloadStartedAtMs;
            expectOk(readBack.status, `readProjectFile back ${relativePath}`, readBack.body);
            assert.strictEqual(
              (readBack.body as { content?: string }).content,
              content,
              "paced transfer must deliver byte-exact content",
            );
            const uploadWireBytes = wireDelta(beforeUpload, proxy.stats(), "clientToServer");
            const downloadWireBytes = wireDelta(beforeDownload, proxy.stats(), "serverToClient");
            // windowMs → bits/second: bytes × 8 × 1000 / ms.
            const uploadThroughputBps = Math.round(
              (uploadWireBytes * 8000) / Math.max(1, uploadWindowMs),
            );
            const downloadThroughputBps = Math.round(
              (downloadWireBytes * 8000) / Math.max(1, downloadWindowMs),
            );
            const serializationFloorMs = Math.ceil(
              (payloadBytes * 1000) / (profile.bitsPerSecond / 8),
            );
            assert(
              downloadWindowMs >= serializationFloorMs - 100,
              `download window ${String(downloadWindowMs)}ms must respect the ${String(serializationFloorMs)}ms serialization floor at ${tag}`,
            );
            assert(
              downloadThroughputBps <= profile.bitsPerSecond * LINK_WINDOW_TOLERANCE,
              `download wire throughput ${String(downloadThroughputBps)}bps must respect the imposed ${String(profile.bitsPerSecond)}bps`,
            );
            assert(
              uploadThroughputBps <= profile.bitsPerSecond * LINK_WINDOW_TOLERANCE,
              `upload wire throughput ${String(uploadThroughputBps)}bps must respect the imposed ${String(profile.bitsPerSecond)}bps`,
            );

            // Phase D — mid-stream disconnect, then replay exact seq/content.
            const offlineCursor = impaired.metrics.lastEventSeq ?? impaired.metrics.readySeq ?? 0;
            const teardownCount = proxy.teardownRelays(`${tag}-mid-stream-teardown`);
            assert(teardownCount >= 1, "mid-stream teardown must remove live relays");
            await impaired.close();
            const offlineRenames: string[] = [];
            for (let index = 1; index <= OFFLINE_RENAMES; index += 1) {
              const uniqueName = `${SEED_PROJECT_NAME}-cn-${tag}-offline-${String(index)}`;
              await renameProjectAndAwaitFanout(healthy, [healthy], workloadProject(), uniqueName);
              offlineRenames.push(uniqueName);
            }
            const offlineDoc = { constrained: `${tag}-offline`, writtenAt: Date.now() };
            const offlineRead = await writeAndReadBackNotes(healthy, workloadProject(), offlineDoc);
            assert.deepStrictEqual(
              offlineRead,
              offlineDoc,
              "offline notes write must read back exactly",
            );

            replayed = await ProfileClient.create({
              handle: impairedHandle,
              label: `cn-${tag}-replay`,
              accessToken: credential.accessToken,
              lastSeenSeq: offlineCursor,
            });
            const replayer = replayed;
            assert(
              (replayer.metrics.readySeq ?? 0) >= offlineCursor,
              "reconnecting device must resume at or beyond its offline cursor",
            );
            // The replay window trickles through the shaper: wait until it
            // actually carries every offline rename before asserting on it.
            const readySeq = replayer.metrics.readySeq ?? 0;
            const replayDeadline = Date.now() + impairedDeadlineMs(profile);
            let replayedEvents: readonly ReceivedEvent[] = [];
            for (;;) {
              replayedEvents = replayer.receivedEvents().filter((event) => event.seq <= readySeq);
              const joined = replayedEvents.map((event) => JSON.stringify(event.event)).join("|");
              if (offlineRenames.every((uniqueName) => joined.includes(uniqueName))) break;
              if (Date.now() > replayDeadline) {
                throw new Error(
                  `replay never delivered the offline renames (${String(replayedEvents.length)} frames ≤ readySeq ${String(readySeq)})`,
                );
              }
              await sleep(200);
            }
            assert.strictEqual(
              replayed.metrics.replayedEventCount,
              replayedEvents.length,
              "replayed-frame accounting",
            );
            assert(
              replayedEvents.length >= OFFLINE_RENAMES,
              "replay must cover every offline rename",
            );
            const replayedRenames = replayedEvents.filter(
              (event) => event.type === "remote-projects-changed",
            );
            let scanAt = 0;
            for (const uniqueName of offlineRenames) {
              while (
                scanAt < replayedRenames.length &&
                !JSON.stringify(replayedRenames[scanAt]?.event).includes(uniqueName)
              ) {
                scanAt += 1;
              }
              assert(scanAt < replayedRenames.length, `replay must contain ${uniqueName} in order`);
              scanAt += 1;
            }
            assert.strictEqual(replayed.metrics.eventSeqGaps, 0, "replay seq gaps");
            assert.strictEqual(replayed.metrics.resyncRequiredCount, 0, "replay resync-required");
            const replayNotes = await replayed.fetchJson(
              "notes-read-replay",
              `/api/projects/${workloadProject().projectId}/notes`,
            );
            expectOk(replayNotes.status, "replay notes read", replayNotes.body);
            assert.deepStrictEqual(
              (replayNotes.body as { notes?: { doc?: unknown } }).notes?.doc,
              offlineDoc,
              "replaying device must observe the exact offline notes content",
            );

            // Convergence: replaying device absorbs the host cursor.
            const convergeDeadline = Date.now() + impairedDeadlineMs(profile);
            let snapshotSeq = -1;
            for (;;) {
              const quiesce = await healthy.fetchJson("snapshot-read-quiesce", "/api/snapshot");
              expectOk(quiesce.status, "quiesce snapshot", quiesce.body);
              snapshotSeq = (quiesce.body as { snapshotSeq?: number }).snapshotSeq ?? -1;
              if (replayed.metrics.lastEventSeq === snapshotSeq) break;
              if (Date.now() > convergeDeadline) {
                throw new Error(
                  `replayer never converged on snapshot seq ${String(snapshotSeq)} (at ${String(replayed.metrics.lastEventSeq)})`,
                );
              }
              await sleep(250);
            }
            const finalDirect = await healthy.fetchJson("snapshot-read-final", "/api/snapshot");
            expectOk(finalDirect.status, "final direct snapshot", finalDirect.body);
            assert.strictEqual(
              (finalDirect.body as { snapshotSeq?: number }).snapshotSeq,
              snapshotSeq,
              "direct snapshot must match the converged cursor",
            );
            const finalStats = proxy.stats();
            assert.strictEqual(
              finalStats.clientToServer.overflowTeardowns +
                finalStats.serverToClient.overflowTeardowns,
              0,
              "bounded buffers must absorb the workload without overflow teardowns",
            );

            const replayedFinal = replayer;
            const replaySnapshot = await replayedFinal.fetchJson(
              "snapshot-read-replay-final",
              "/api/snapshot",
            );
            expectOk(replaySnapshot.status, "final replay snapshot", replaySnapshot.body);
            assert.deepStrictEqual(
              (finalDirect.body as { projects?: unknown }).projects,
              (replaySnapshot.body as { projects?: unknown }).projects,
              "authoritative project lists must converge across the constrained and direct paths",
            );
            const artifact = buildMetricsArtifact([impaired, healthy, replayedFinal], {
              profile: { ...profile, oneWayDelayMs },
              calibration,
              proxyStats: finalStats,
              pacingTransfer: {
                payloadBytes,
                relativePath,
                serializationFloorMs,
                uploadWindowMs,
                uploadWireBytes,
                uploadThroughputBps,
                downloadWindowMs,
                downloadWireBytes,
                downloadThroughputBps,
                linkBitsPerSecond: profile.bitsPerSecond,
              },
              snapshotWire,
              phases: {
                windowStartedAtMs,
                snapshotRoundTripMs,
                fanoutA,
                fanoutB,
                impairedPingRttMs,
                healthyPingRttMs: healthy.metrics.wsPingRttMs.at(-1) ?? 0,
                offlineCursor,
                replayedEvents: replayedEvents.length,
                warmupColdGitStatusMs,
              },
              environment: BUILD_PROVENANCE_NOTE,
            });
            const path = writeEvidence(`metrics-${tag}.json`, artifact);
            console.log(
              `[constrained] ${tag}: snapshotRtt=${String(snapshotRoundTripMs)}ms ` +
                `impairedPing=${String(impairedPingRttMs)}ms downloadWire=${String(downloadThroughputBps)}bps ` +
                `replayedEvents=${String(replayedEvents.length)} → ${path}`,
            );
          } finally {
            await closeProfileClients(
              [impaired, healthy, replayed].filter((client): client is ProfileClient => !!client),
            );
            await proxy.close();
          }
        },
        PROFILE_TEST_TIMEOUT_MS[tag] ?? 300_000,
      );
    }

    it("records the run summary", async () => {
      const path = writeEvidence("summary.json", {
        runStartedAtIso: runStartedAtIso ?? null,
        runFinishedAtIso: new Date().toISOString(),
        build: provenance ? summarizeProvenance(provenance) : null,
        profiles: PROFILES,
        calibration,
        offlineRenames: OFFLINE_RENAMES,
        warmupColdGitStatusMs,
        protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        approximation:
          "The shaper imposes one-way base delay plus per-byte serialization PER " +
          "CONNECTION (see helpers/constrainedShaper.ts). It does not model packet " +
          "loss, congestion windows, reordering, or TCP connect latency; aggregate " +
          "physical bandwidth across multiple concurrent HTTP/WS connections is not " +
          "modeled — each connection receives the full configured rate. Results are a " +
          "calibrated bandwidth/latency link model, not a wireless-channel claim.",
        evidence: BUILD_PROVENANCE_NOTE,
      });
      console.log(`[constrained] run summary → ${path}`);
      expect(provenance?.artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
    }, 30_000);
  },
);
