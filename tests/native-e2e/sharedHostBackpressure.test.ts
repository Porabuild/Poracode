import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import { expect, it } from "vitest";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { findRepoRoot } from "./harness/paths.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import { expectOk, renameProjectAndAwaitFanout } from "./helpers/sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts.ts";

/** Production host and default outbound limits. Random base64 avoids a tiny
 * compressed payload hiding entirely inside socket buffers. Each batch waits
 * for the healthy reader, so the producer cannot outrun both clients together.
 * This probes disconnect/recovery, not a latency SLA or internal queue gauge. */
it("isolates a paused terminal receiver under incompressible output and recovers its cursor", async () => {
  const repoRoot = findRepoRoot();
  const cleanup = new ProcessCleanup();
  let host: RealHostHandle | undefined;
  const clients: ProfileClient[] = [];
  try {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "backpressure-qa"),
    });
    const credential = await acquireDeviceCredential(host, "pressure");
    const healthy = await ProfileClient.create({ handle: host, label: "healthy", ...credential });
    clients.push(healthy);
    const slow = await ProfileClient.create({ handle: host, label: "paused", ...credential });
    clients.push(slow);
    const snapshot = await healthy.fetchJson("snapshot", "/api/snapshot");
    expectOk(snapshot.status, "snapshot", snapshot.body);
    const projects = (
      snapshot.body as {
        projects: Array<{ id: string; location: { kind: string; path: string } }>;
      }
    ).projects;
    const project = projects[0]!;
    expect(project.location.kind).toBe("posix");
    const shellId = "pressure-shell";
    const watchId = "pressure-watch";
    const started = await healthy.fetchJson("start", "/api/terminal/start", {
      method: "POST",
      body: { shellId, projectLocation: project.location },
    });
    expectOk(started.status, "terminal start", started.body);
    expect((await healthy.watchTerminalReliable(shellId, watchId)).status).toBe("ready");
    expect((await slow.watchTerminalReliable(shellId, watchId)).status).toBe("ready");
    const write = async (data: string) => {
      const result = await healthy.fetchJson("write", `/api/threads/${shellId}/terminal/write`, {
        method: "POST",
        body: { data },
      });
      expectOk(result.status, "terminal write", result.body);
    };
    const waitText = async (text: string) => {
      await expect
        .poll(() => healthy.terminalState(watchId)?.assembledText.includes(text), {
          timeout: 20_000,
        })
        .toBe(true);
    };
    await write("printf 'PRESSURE-%s\\n' 'READY'\r");
    await waitText("PRESSURE-READY\r\n");
    await expect
      .poll(() => slow.terminalState(watchId)?.assembledText.includes("PRESSURE-READY\r\n"))
      .toBe(true);

    const replayCursor = slow.metrics.lastEventSeq ?? slow.metrics.readySeq ?? 0;
    const slowWireBeforePause = slow.metrics.transportSocketBytesReceived;
    slow.pauseSocket();
    const pausedAt = performance.now();
    let payloadBytes = 0;
    // 32 x 384KiB random bytes -> 32 x 512KiB base64 = 16 MiB total. The
    // eviction guard counts only bytes queued in the server process
    // (ws.bufferedAmount = Node Writable queue + ws sender queue), NOT bytes
    // the kernel already accepted. Linux autotunes socket buffers
    // (tcp_rmem max ~6 MiB + tcp_wmem max ~4 MiB) that can absorb ~10 MiB
    // for a stalled-but-window-open receiver, so an 8 MiB storm never
    // reaches the 4 MiB app-level guard on linux runners while macOS evicts
    // early. 16 MiB forces the app-level queue past the guard on both.
    const batches = 32;
    for (let index = 0; index < batches; index++) {
      const payload = randomBytes(384 * 1024).toString("base64");
      payloadBytes += Buffer.byteLength(payload);
      const file = join(project.location.path, "pressure-payload.txt");
      writeFileSync(file, payload);
      const quotedFile = `'${file.replaceAll("'", "'\\''")}'`;
      await write(`cat ${quotedFile}; printf '\\nPRESSURE-%s\\n' '${index}'\r`);
      await waitText(`PRESSURE-${index}\r\n`);
      expect(healthy.terminalState(watchId)?.assembledText.includes(payload)).toBe(true);
      expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
    }
    const timings = await renameProjectAndAwaitFanout(
      healthy,
      [healthy],
      {
        projectId: project.id,
        locationPath: project.location.path,
      },
      "pressure-healthy-survived",
    );
    await healthy.ping();
    const pauseDurationMs = performance.now() - pausedAt;
    // Rule out the default 30s heartbeat sweep as the reason for disconnection.
    expect(pauseDurationMs).toBeLessThan(30_000);
    slow.resumeSocket();
    await expect.poll(() => slow.ws.readyState, { timeout: 10_000 }).toBe(WebSocket.CLOSED);
    expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
    expect(healthy.metrics.eventSeqGaps).toBe(0);

    const recovered = await ProfileClient.create({
      handle: host,
      label: "recovered",
      accessToken: credential.accessToken,
      lastSeenSeq: replayCursor,
    });
    clients.push(recovered);
    expect((await recovered.watchTerminalReliable(shellId, watchId)).status).toBe("ready");
    await expect
      .poll(() => {
        const current = healthy.terminalState(watchId)?.finalCursor;
        return (
          typeof current === "number" && recovered.terminalState(watchId)?.finalCursor === current
        );
      })
      .toBe(true);
    const recoveredText = recovered.terminalState(watchId)?.assembledText ?? "";
    expect(recoveredText).toContain("PRESSURE-31\r\n");
    expect(healthy.terminalState(watchId)?.assembledText.endsWith(recoveredText)).toBe(true);
    expect(recovered.metrics.eventSeqGaps).toBe(0);
    writeExperimentArtifact(repoRoot, "backpressure.json", {
      batches,
      payloadBytes,
      pauseDurationMs,
      timings,
      slowSocketClosed: true,
      healthySocketOpen: true,
      slowPostPauseWireBytes: slow.metrics.transportSocketBytesReceived - slowWireBeforePause,
      healthyCursor: healthy.terminalState(watchId)?.finalCursor,
      recoveredCursor: recovered.terminalState(watchId)?.finalCursor,
      recoveredTailBytes: Buffer.byteLength(recoveredText),
      limits:
        "Default production limits; socket close observed, internal queue occupancy not instrumented. Recovery preserves the retained tail, not unbounded history.",
    });
  } finally {
    try {
      await closeProfileClients(clients);
    } finally {
      try {
        await host?.stop();
      } finally {
        await cleanup.shutdown();
      }
    }
  }
}, 120_000);
